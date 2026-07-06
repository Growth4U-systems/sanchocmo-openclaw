# Existing Customer Data — Schema

## Section 1: Overview
| Field | Type | Required |
|-------|------|----------|
| total_customers | number | REQUIRED |
| avg_mrr | number (€) | REQUIRED |
| churn_rate_monthly | percentage | REQUIRED |
| avg_ltv | number (€) | REQUIRED |
| data_source | string | REQUIRED |

## Section 2: RFM Segments
| Field | Type | Required |
|-------|------|----------|
| segments | object[] | REQUIRED |

Segment: `{ name, count, percentage, avg_mrr, churn_rate, action }`

## Section 3: Best Customer Profile
| Field | Type | Required |
|-------|------|----------|
| plan_tier | string | REQUIRED |
| company_size | string | Lite |
| industry | string | Lite |
| use_case | string | REQUIRED |
| avg_mrr | number | REQUIRED |
| churn_rate | percentage | REQUIRED |
| referral_rate | percentage | Lite |
| why_best | string[] | REQUIRED |

## Section 4: Behavioral Clusters
| Field | Type | Required |
|-------|------|----------|
| clusters | object[] (3-5) | REQUIRED |

Cluster: `{ name, size, percentage, characteristics, features_used, upgrade_rate }`

## Section 5: Churn Patterns
| Field | Type | Required |
|-------|------|----------|
| when | object[] | REQUIRED |
| why | object[] | REQUIRED |
| early_warning_signals | string[] | REQUIRED |

## Section 6: Upgrade Patterns
| Field | Type | Required |
|-------|------|----------|
| free_to_paid_conversion | percentage | Lite |
| avg_time_to_convert | number (days) | Lite |
| tier_progression | object[] | Lite |

## Storage
- **Tier 1**: Overview + Champions profile
- **Tier 2**: Full RFM + clusters + churn + recommendations
- **Tier 3**: Raw data references
