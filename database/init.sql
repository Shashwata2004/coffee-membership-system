CREATE TABLE IF NOT EXISTS coffees (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    price INTEGER NOT NULL CHECK (price > 0)
);

CREATE TABLE IF NOT EXISTS members (
    member_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0)
);

CREATE TABLE IF NOT EXISTS purchases (
    purchase_id TEXT PRIMARY KEY,
    member_id TEXT NOT NULL REFERENCES members(member_id) ON DELETE RESTRICT,
    coffee_id TEXT NOT NULL REFERENCES coffees(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    total_amount INTEGER NOT NULL CHECK (total_amount >= 0),
    points_earned INTEGER NOT NULL CHECK (points_earned >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchases_member_id ON purchases(member_id);
CREATE INDEX IF NOT EXISTS idx_purchases_coffee_id ON purchases(coffee_id);
