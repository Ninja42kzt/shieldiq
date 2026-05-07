"""
ShieldIQ - Adaptive Training AI Model
======================================
This model sits dormant until you have enough real user data.

HOW TO USE:
1. After collecting data (aim for 100+ users, 500+ quiz results):
   $ pip install pandas numpy scikit-learn joblib
   $ python ml/Ai.py

2. The model will:
   - Export data from shieldiq.db
   - Train 3 models (risk classifier, module recommender, weak area predictor)
   - Save them to ml/models/ as .pkl files

3. Once trained, update routes/quiz.js to call the Python model
   via a child process instead of ai_recommend.js

MODELS BEING TRAINED:
- risk_model.pkl        → predicts user risk level (Low/Medium/High)
- recommend_model.pkl   → predicts which module to do next
- weakarea_model.pkl    → predicts which topic areas are weak
"""

import os
import sqlite3
import json
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from sklearn.preprocessing import LabelEncoder
import joblib

# ── Config ────────────────────────────────────────────────────────────────────

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'shieldiq.db')
MODELS_DIR = os.path.join(os.path.dirname(__file__), 'models')
MIN_SAMPLES = 50  # Minimum quiz results needed to train

ALL_MODULES = ['phishing', 'passwords', 'social', 'devices', 'data', 'incident']

os.makedirs(MODELS_DIR, exist_ok=True)

# ── Data Loading ──────────────────────────────────────────────────────────────

def load_data():
    """Load and join quiz results with user data from SQLite."""
    print("📂 Loading data from database...")

    conn = sqlite3.connect(DB_PATH)

    query = """
        SELECT
            u.id as user_id,
            u.plan,
            q.category,
            q.score,
            q.weak_areas,
            q.taken_at
        FROM quiz_results q
        JOIN users u ON q.user_id = u.id
        ORDER BY q.user_id, q.taken_at
    """

    df = pd.read_sql_query(query, conn)
    conn.close()

    print(f"✅ Loaded {len(df)} quiz results from {df['user_id'].nunique()} users")
    return df


def check_data_sufficiency(df):
    """Check if we have enough data to train."""
    if len(df) < MIN_SAMPLES:
        print(f"\n⚠️  Not enough data yet.")
        print(f"   Current: {len(df)} quiz results")
        print(f"   Needed:  {MIN_SAMPLES} minimum")
        print(f"\n   Come back after your first month of user data!")
        return False
    print(f"✅ Sufficient data: {len(df)} results")
    return True


# ── Feature Engineering ───────────────────────────────────────────────────────

def build_user_features(df):
    """
    Transform raw quiz results into per-user feature vectors.

    Features per user:
    - Score for each module (0 if not taken)
    - Number of modules completed
    - Overall average score
    - Number of weak areas flagged
    - Whether each module has been completed
    """
    print("\n🔧 Engineering features...")

    users = []

    for user_id, group in df.groupby('user_id'):
        features = {'user_id': user_id}

        # Score per module (average if taken multiple times)
        module_scores = {}
        for module in ALL_MODULES:
            module_data = group[group['category'] == module]
            if len(module_data) > 0:
                module_scores[module] = module_data['score'].mean()
                features[f'score_{module}'] = module_scores[module]
                features[f'completed_{module}'] = 1
            else:
                features[f'score_{module}'] = 0
                features[f'completed_{module}'] = 0

        # Aggregate features
        features['modules_completed'] = sum(
            1 for m in ALL_MODULES if features[f'completed_{m}'] == 1
        )
        features['avg_score'] = group['score'].mean()
        features['min_score'] = group['score'].min()
        features['max_score'] = group['score'].max()
        features['score_variance'] = group['score'].var() if len(group) > 1 else 0

        # Weak areas count
        all_weak = []
        for _, row in group.iterrows():
            if row['weak_areas']:
                try:
                    areas = json.loads(row['weak_areas'])
                    if isinstance(areas, list):
                        all_weak.extend(areas)
                except:
                    pass
        features['total_weak_areas'] = len(all_weak)
        features['unique_weak_areas'] = len(set(all_weak))

        users.append(features)

    feature_df = pd.DataFrame(users)
    print(f"✅ Built features for {len(feature_df)} users")
    return feature_df


# ── Label Generation ──────────────────────────────────────────────────────────

def generate_risk_labels(feature_df):
    """
    Generate risk level labels based on scores.
    Low >= 80, Medium >= 60, High < 60 or no modules done
    """
    def risk_label(row):
        if row['modules_completed'] == 0:
            return 'High'
        if row['avg_score'] >= 80:
            return 'Low'
        elif row['avg_score'] >= 60:
            return 'Medium'
        else:
            return 'High'

    return feature_df.apply(risk_label, axis=1)


def generate_recommendation_labels(feature_df):
    """
    Generate 'next module to take' labels.
    Priority: incomplete modules first, then lowest scoring completed module.
    """
    def recommend_label(row):
        # First recommend any incomplete module
        for module in ALL_MODULES:
            if row[f'completed_{module}'] == 0:
                return module

        # All done — recommend the weakest
        scores = {m: row[f'score_{m}'] for m in ALL_MODULES}
        return min(scores, key=scores.get)

    return feature_df.apply(recommend_label, axis=1)


def generate_weakarea_labels(feature_df):
    """
    Generate weak module label — the single module with lowest score.
    """
    def weakest_label(row):
        completed = [m for m in ALL_MODULES if row[f'completed_{m}'] == 1]
        if not completed:
            return 'phishing'  # default
        return min(completed, key=lambda m: row[f'score_{m}'])

    return feature_df.apply(weakest_label, axis=1)


# ── Training ──────────────────────────────────────────────────────────────────

FEATURE_COLS = (
    [f'score_{m}' for m in ALL_MODULES] +
    [f'completed_{m}' for m in ALL_MODULES] +
    ['modules_completed', 'avg_score', 'min_score', 'max_score',
     'score_variance', 'total_weak_areas', 'unique_weak_areas']
)


def train_model(X, y, model_name, label_encoder=None):
    """Train a RandomForest and evaluate it."""
    print(f"\n🤖 Training {model_name}...")

    if len(X) < 10:
        print(f"  ⚠️  Too few samples ({len(X)}) for {model_name}. Skipping.")
        return None, None

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y if len(set(y)) > 1 else None
    )

    model = RandomForestClassifier(
        n_estimators=100,
        max_depth=10,
        min_samples_split=2,
        random_state=42,
        class_weight='balanced'
    )

    model.fit(X_train, y_train)
    y_pred = model.predict(X_test)
    acc = accuracy_score(y_test, y_pred)

    print(f"  ✅ Accuracy: {acc:.2%}")
    print(f"\n  Classification Report:\n{classification_report(y_test, y_pred)}")

    return model, acc


def save_model(model, label_encoder, filename):
    """Save model and encoder to disk."""
    path = os.path.join(MODELS_DIR, filename)
    joblib.dump({'model': model, 'encoder': label_encoder}, path)
    print(f"  💾 Saved → {path}")


# ── Visualisation ─────────────────────────────────────────────────────────────

def plot_feature_importance(model, feature_names, title, filename):
    """Plot and save feature importance chart."""
    importances = model.feature_importances_
    indices = np.argsort(importances)[::-1][:10]  # Top 10

    plt.figure(figsize=(10, 6))
    plt.title(f'Feature Importance — {title}')
    plt.bar(range(len(indices)), importances[indices], color='#00D4FF', alpha=0.8)
    plt.xticks(range(len(indices)), [feature_names[i] for i in indices], rotation=45, ha='right')
    plt.tight_layout()

    chart_path = os.path.join(MODELS_DIR, filename)
    plt.savefig(chart_path)
    plt.close()
    print(f"  📊 Chart saved → {chart_path}")


def plot_score_distribution(feature_df):
    """Plot average score distribution across users."""
    plt.figure(figsize=(10, 5))
    plt.subplot(1, 2, 1)
    plt.hist(feature_df['avg_score'], bins=20, color='#00D4FF', alpha=0.7, edgecolor='white')
    plt.title('Average Score Distribution')
    plt.xlabel('Score (%)')
    plt.ylabel('Users')

    plt.subplot(1, 2, 2)
    plt.hist(feature_df['modules_completed'], bins=7, color='#0099BB', alpha=0.7, edgecolor='white')
    plt.title('Modules Completed Distribution')
    plt.xlabel('Modules')
    plt.ylabel('Users')

    plt.tight_layout()
    chart_path = os.path.join(MODELS_DIR, 'score_distribution.png')
    plt.savefig(chart_path)
    plt.close()
    print(f"  📊 Distribution chart → {chart_path}")


# ── Prediction Interface ──────────────────────────────────────────────────────

def predict_for_user(user_quiz_results):
    """
    Make predictions for a single user given their quiz results.
    Called from Node.js via child_process once models are trained.

    user_quiz_results: list of dicts with keys: category, score, weak_areas
    """
    # Check models exist
    risk_path = os.path.join(MODELS_DIR, 'risk_model.pkl')
    rec_path  = os.path.join(MODELS_DIR, 'recommend_model.pkl')

    if not os.path.exists(risk_path):
        return {'error': 'Models not trained yet. Run Ai.py first.'}

    # Build feature vector
    features = {}
    for module in ALL_MODULES:
        module_results = [r for r in user_quiz_results if r['category'] == module]
        if module_results:
            features[f'score_{module}'] = np.mean([r['score'] for r in module_results])
            features[f'completed_{module}'] = 1
        else:
            features[f'score_{module}'] = 0
            features[f'completed_{module}'] = 0

    scores = [features[f'score_{m}'] for m in ALL_MODULES if features[f'completed_{m}'] == 1]
    features['modules_completed'] = sum(features[f'completed_{m}'] for m in ALL_MODULES)
    features['avg_score']         = np.mean(scores) if scores else 0
    features['min_score']         = np.min(scores) if scores else 0
    features['max_score']         = np.max(scores) if scores else 0
    features['score_variance']    = np.var(scores) if len(scores) > 1 else 0

    all_weak = []
    for r in user_quiz_results:
        if r.get('weak_areas'):
            try:
                areas = json.loads(r['weak_areas']) if isinstance(r['weak_areas'], str) else r['weak_areas']
                if isinstance(areas, list):
                    all_weak.extend(areas)
            except:
                pass

    features['total_weak_areas']  = len(all_weak)
    features['unique_weak_areas'] = len(set(all_weak))

    X = pd.DataFrame([features])[FEATURE_COLS]

    # Load and predict
    risk_bundle = joblib.load(risk_path)
    rec_bundle  = joblib.load(rec_path)

    risk       = risk_bundle['model'].predict(X)[0]
    next_module = rec_bundle['model'].predict(X)[0]

    return {
        'riskLevel':     risk,
        'nextModule':    next_module,
        'moduleScores':  {m: features[f'score_{m}'] for m in ALL_MODULES},
        'modulesCompleted': int(features['modules_completed']),
        'avgScore':      round(float(features['avg_score']), 1)
    }


# ── Main Training Pipeline ────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("  ShieldIQ AI Model Training Pipeline")
    print("=" * 60)

    # 1. Load data
    df = load_data()

    if not check_data_sufficiency(df):
        return

    # 2. Build features
    feature_df = build_user_features(df)

    # 3. Plot distributions
    print("\n📊 Generating data visualisations...")
    plot_score_distribution(feature_df)

    X = feature_df[FEATURE_COLS]

    # 4. Train Risk Model
    y_risk = generate_risk_labels(feature_df)
    risk_model, risk_acc = train_model(X, y_risk, 'Risk Classifier')
    if risk_model:
        save_model(risk_model, None, 'risk_model.pkl')
        plot_feature_importance(risk_model, FEATURE_COLS, 'Risk Classifier', 'risk_importance.png')

    # 5. Train Recommendation Model
    y_rec = generate_recommendation_labels(feature_df)
    rec_model, rec_acc = train_model(X, y_rec, 'Module Recommender')
    if rec_model:
        save_model(rec_model, None, 'recommend_model.pkl')
        plot_feature_importance(rec_model, FEATURE_COLS, 'Module Recommender', 'rec_importance.png')

    # 6. Train Weak Area Model
    y_weak = generate_weakarea_labels(feature_df)
    weak_model, weak_acc = train_model(X, y_weak, 'Weak Area Predictor')
    if weak_model:
        save_model(weak_model, None, 'weakarea_model.pkl')

    # 7. Summary
    print("\n" + "=" * 60)
    print("  ✅ Training Complete!")
    print("=" * 60)
    print(f"  Risk Classifier accuracy:    {risk_acc:.2%}" if risk_model else "  Risk Classifier: skipped")
    print(f"  Module Recommender accuracy: {rec_acc:.2%}" if rec_model else "  Module Recommender: skipped")
    print(f"  Models saved to: {MODELS_DIR}")
    print("\n  Next step: update routes/quiz.js to use predict_for_user()")
    print("=" * 60)


if __name__ == '__main__':
    main()