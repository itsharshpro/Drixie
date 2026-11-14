import { bigint, customType, numeric, timestamp } from "drizzle-orm/pg-core";

export const amount = (name: string) => numeric(name);

export const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const height = (name: string) => bigint(name, { mode: "number" });

export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});
