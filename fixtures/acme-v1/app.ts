// Synthetic source fixture. Parsed as text, never imported or executed.
import express from "express";
const app = express();
export interface Customer {
  id: string;
  name: string;
  email: string;
  tier: string;
  active: boolean;
}
export interface Order {
  id: string;
  customerId: string;
  total: number;
}
app.get("/api/customers", () => {});
app.get("/api/orders", () => {});
app.post("/api/orders", () => {});
