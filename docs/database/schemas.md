# Database Schema

PostgreSQL schema for the coffee bonus point system.

## Tables

### coffees
- `id` TEXT, PK. Coffee identifier (UUID or provided string).
- `name` TEXT, unique, not null.
- `price` INTEGER, not null, must be > 0.

### members
- `member_id` TEXT, PK. Member identifier (UUID or provided string).
- `name` TEXT, not null.
- `phone` TEXT, unique, not null.
- `points` INTEGER, not null, default 0, must be >= 0.

### purchases
- `purchase_id` TEXT, PK. Purchase identifier (UUID).
- `member_id` TEXT, FK to `members.member_id`, not null.
- `coffee_id` TEXT, FK to `coffees.id`, not null.
- `quantity` INTEGER, not null, must be > 0.
- `total_amount` INTEGER, not null, must be >= 0.
- `points_earned` INTEGER, not null, must be >= 0.
- `created_at` TIMESTAMPTZ, not null, default NOW().

## Relationships
- `purchases.member_id` -> `members.member_id`
- `purchases.coffee_id` -> `coffees.id`

## Notes
- IDs are stored as TEXT to allow both UUIDs and custom IDs (e.g., "M1").
- Bonus rule: 1 point per 50 taka spent; enforced in application logic.
