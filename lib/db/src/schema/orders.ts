import { createInsertSchema } from "drizzle-zod";
import { date, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export type OrderItemRecord = {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
};

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  customerName: text("customer_name").notNull(),
  recipientName: text("recipient_name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  occasion: text("occasion").notNull(),
  deliveryAddress: text("delivery_address").notNull(),
  eventDate: date("event_date", { mode: "string" }),
  note: text("note"),
  items: jsonb("items").$type<OrderItemRecord[]>().notNull(),
  total: integer("total").notNull(),
  status: text("status").notNull().default("new"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({
  id: true,
  createdAt: true,
});

export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
