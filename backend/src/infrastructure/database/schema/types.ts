import { customType } from "drizzle-orm/pg-core";

/**
 * Coluna BYTEA para valores cifrados (R81). O node-postgres devolve BYTEA como Buffer.
 */
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});
