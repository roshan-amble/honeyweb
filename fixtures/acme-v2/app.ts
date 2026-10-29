// Synthetic schema evolution: customers become accounts with a region.
import express from "express";
const app = express();
export interface Account {
  id: string;
  name: string;
  email: string;
  tier: string;
  active: boolean;
  region: string;
}
export interface Order {
  id: string;
  accountId: string;
  total: number;
}
app.get("/api/accounts", () => {});
app.get("/api/orders", () => {});
app.post("/api/orders", () => {});
