const crypto = require('crypto');
const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT) || 5432,
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
  database: process.env.PGDATABASE || 'coffee_bonus'
});

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

async function withTransaction(handler) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await handler(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('Rollback failed', rollbackErr);
    }
    throw err;
  } finally {
    client.release();
  }
}

app.post('/coffees', async (req, res, next) => {
  try {
    const { name, price } = req.body || {};

    if (!isNonEmptyString(name) || !isPositiveInteger(price)) {
      return res.status(400).json({ error: 'Invalid name or price.' });
    }

    const id = crypto.randomUUID();
    const query =
      'INSERT INTO coffees (id, name, price) VALUES ($1, $2, $3) RETURNING id, name, price';

    try {
      const result = await pool.query(query, [id, name.trim(), price]);
      return res.status(201).json(result.rows[0]);
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: 'Coffee name must be unique.' });
      }
      throw err;
    }
  } catch (err) {
    return next(err);
  }
});

app.post('/members', async (req, res, next) => {
  try {
    const { memberId, name, phone } = req.body || {};

    if (!isNonEmptyString(name) || !isNonEmptyString(phone)) {
      return res.status(400).json({ error: 'Invalid name or phone.' });
    }

    let finalMemberId = memberId;
    if (finalMemberId !== undefined && !isNonEmptyString(finalMemberId)) {
      return res.status(400).json({ error: 'Invalid memberId.' });
    }

    if (!finalMemberId) {
      finalMemberId = crypto.randomUUID();
    } else {
      finalMemberId = finalMemberId.trim();
    }

    const query =
      'INSERT INTO members (member_id, name, phone, points) VALUES ($1, $2, $3, 0) RETURNING member_id, name, phone, points';

    try {
      const result = await pool.query(query, [finalMemberId, name.trim(), phone.trim()]);
      const row = result.rows[0];
      return res.status(201).json({
        memberId: row.member_id,
        name: row.name,
        phone: row.phone,
        points: row.points
      });
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: 'memberId or phone must be unique.' });
      }
      throw err;
    }
  } catch (err) {
    return next(err);
  }
});

app.post('/purchase', async (req, res, next) => {
  try {
    const { memberId, coffeeId, quantity } = req.body || {};

    if (!isNonEmptyString(memberId) || !isNonEmptyString(coffeeId) || !isPositiveInteger(quantity)) {
      return res.status(400).json({ error: 'Invalid memberId, coffeeId, or quantity.' });
    }

    const trimmedMemberId = memberId.trim();
    const trimmedCoffeeId = coffeeId.trim();

    const result = await withTransaction(async (client) => {
      const memberResult = await client.query(
        'SELECT points FROM members WHERE member_id = $1 FOR UPDATE',
        [trimmedMemberId]
      );
      if (memberResult.rowCount === 0) {
        return { status: 404, body: { error: 'Member not found.' } };
      }

      const coffeeResult = await client.query('SELECT price FROM coffees WHERE id = $1', [trimmedCoffeeId]);
      if (coffeeResult.rowCount === 0) {
        return { status: 404, body: { error: 'Coffee not found.' } };
      }

      const price = coffeeResult.rows[0].price;
      const totalAmount = price * quantity;
      const pointsEarned = Math.floor(totalAmount / 50);
      const totalPoints = memberResult.rows[0].points + pointsEarned;
      const purchaseId = crypto.randomUUID();

      await client.query(
        'INSERT INTO purchases (purchase_id, member_id, coffee_id, quantity, total_amount, points_earned) VALUES ($1, $2, $3, $4, $5, $6)',
        [purchaseId, trimmedMemberId, trimmedCoffeeId, quantity, totalAmount, pointsEarned]
      );

      await client.query('UPDATE members SET points = $1 WHERE member_id = $2', [totalPoints, trimmedMemberId]);

      return {
        status: 201,
        body: {
          purchaseId,
          memberId: trimmedMemberId,
          coffeeId: trimmedCoffeeId,
          quantity,
          totalAmount,
          pointsEarned,
          totalPoints
        }
      };
    });

    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
});

app.post('/members/:memberId/redeem', async (req, res, next) => {
  try {
    const memberId = req.params.memberId;
    const { pointsToUse, price } = req.body || {};

    if (!isNonEmptyString(memberId) || !isNonNegativeInteger(pointsToUse) || !isNonNegativeInteger(price)) {
      return res.status(400).json({ error: 'Invalid memberId, pointsToUse, or price.' });
    }

    const trimmedMemberId = memberId.trim();

    const result = await withTransaction(async (client) => {
      const memberResult = await client.query(
        'SELECT points FROM members WHERE member_id = $1 FOR UPDATE',
        [trimmedMemberId]
      );
      if (memberResult.rowCount === 0) {
        return { status: 404, body: { error: 'Member not found.' } };
      }

      const availablePoints = memberResult.rows[0].points;
      const usedPoints = Math.min(pointsToUse, availablePoints, price);
      const remainingPoints = availablePoints - usedPoints;
      const discountedPrice = price - usedPoints;

      await client.query('UPDATE members SET points = $1 WHERE member_id = $2', [remainingPoints, trimmedMemberId]);

      return {
        status: 200,
        body: {
          memberId: trimmedMemberId,
          usedPoints,
          discountAmount: usedPoints,
          discountedPrice,
          remainingPoints
        }
      };
    });

    return res.status(result.status).json(result.body);
  } catch (err) {
    return next(err);
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error.' });
});

const port = Number(process.env.PORT) || 8000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
