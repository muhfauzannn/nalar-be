import { setDefaultAutoSelectFamily } from "node:net";

import postgres from "postgres";

const RESET_CONFIRMATION = "RESET";
const MIGRATION_TABLE = "__drizzle_migrations";

// Avoid connection races on dual-stack database hosts where IPv6 is unavailable.
setDefaultAutoSelectFamily(false);

function requiredDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("Missing required environment variable: DATABASE_URL");
  }

  return databaseUrl;
}

function databaseTarget(databaseUrl: string) {
  try {
    const parsedUrl = new URL(databaseUrl);
    const databaseName = parsedUrl.pathname.replace(/^\//, "") || "default database";
    return `${parsedUrl.hostname}:${parsedUrl.port || "5432"}/${databaseName}`;
  } catch {
    return "database configured in DATABASE_URL";
  }
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function confirmReset(target: string) {
  if (process.argv.includes("--force")) return;

  if (!process.stdin.isTTY) {
    throw new Error(
      "Reset non-interaktif memerlukan flag --force: bun db:reset --force",
    );
  }

  const answer = prompt(
    `Semua data aplikasi dan autentikasi di ${target} akan dihapus. Ketik ${RESET_CONFIRMATION} untuk melanjutkan:`,
  );

  if (answer !== RESET_CONFIRMATION) {
    console.log("Reset database dibatalkan.");
    process.exit(0);
  }
}

async function resetDatabase() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("db:reset tidak boleh dijalankan dengan NODE_ENV=production.");
  }

  const databaseUrl = requiredDatabaseUrl();
  const target = databaseTarget(databaseUrl);
  confirmReset(target);

  const queryClient = postgres(databaseUrl, { max: 1 });

  try {
    const tableRows = await queryClient`
      select table_name
      from information_schema.tables
      where table_schema = current_schema()
        and table_type = 'BASE TABLE'
        and table_name <> ${MIGRATION_TABLE}
      order by table_name
    `;
    const tableNames = tableRows.flatMap((row) =>
      typeof row.table_name === "string" ? [row.table_name] : [],
    );

    if (tableNames.length === 0) {
      console.log(`Tidak ada tabel aplikasi yang perlu dikosongkan di ${target}.`);
      return;
    }

    const tableList = tableNames.map(quoteIdentifier).join(", ");
    await queryClient.unsafe(
      `truncate table ${tableList} restart identity cascade`,
    );

    console.log(
      `Reset selesai: ${tableNames.length} tabel aplikasi dan autentikasi dikosongkan di ${target}.`,
    );
    console.log("Schema dan histori migration Drizzle tetap dipertahankan.");
  } finally {
    await queryClient.end();
  }
}

try {
  await resetDatabase();
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Reset database gagal dijalankan.");
  process.exit(1);
}
