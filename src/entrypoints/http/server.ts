import { bootstrap } from "../../app/bootstrap.js";

/**
 * CLI-safe server startup entrypoint.
 */
async function main(): Promise<void> {
  await bootstrap();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

