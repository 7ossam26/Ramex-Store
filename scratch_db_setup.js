import pg from 'pg';

const { Client } = pg;

async function setup() {
  const passwords = ['postgres', '00000000', '', 'admin', 'root', '123456'];
  let client;
  let connected = false;

  for (const pwd of passwords) {
    client = new Client({
      host: 'localhost',
      port: 5432,
      user: 'postgres',
      password: pwd,
    });
    try {
      await client.connect();
      console.log("Connected as postgres with password:", pwd ? "***" : "empty");
      connected = true;
      break;
    } catch (err) {
      // try next
    }
  }

  if (!connected) {
    console.log("Failed to connect with common passwords.");
    return;
  }

  try {
    // Create user if not exists
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT FROM pg_catalog.pg_roles WHERE rolname = 'ramex_user'
        ) THEN
          CREATE ROLE ramex_user WITH LOGIN PASSWORD '00000000';
        ELSE
          ALTER ROLE ramex_user WITH PASSWORD '00000000';
        END IF;
      END
      $$;
    `);
    console.log("User ramex_user configured.");

    // Create DB if not exists
    const dbRes = await client.query(`SELECT datname FROM pg_database WHERE datname = 'ramex_store'`);
    if (dbRes.rows.length === 0) {
      await client.query(`CREATE DATABASE ramex_store OWNER ramex_user`);
      console.log("Database ramex_store created.");
    } else {
      console.log("Database ramex_store already exists.");
      await client.query(`ALTER DATABASE ramex_store OWNER TO ramex_user`);
    }
    
    await client.end();
  } catch (err) {
    console.error("Failed executing queries:", err.message);
  }
}

setup();
