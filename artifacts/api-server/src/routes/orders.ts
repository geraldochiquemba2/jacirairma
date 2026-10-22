import { Router, type IRouter } from "express";
import { CreateOrderBody, CreateOrderResponse } from "@workspace/api-zod";
import { db, ordersTable } from "@workspace/db";

const router: IRouter = Router();

const catalog: Record<string, { name: string; price: number }> = {
  "noite-a-dois": { name: "Noite a Dois", price: 120000 },
  "caixa-amor": { name: "Caixa do Amor", price: 45000 },
  "rosas-surpresa": { name: "Rosas de Surpresa", price: 35000 },
  "pequeno-almoco": { name: "Pequeno-almoço Romântico", price: 65000 },
  piquenique: { name: "Piquenique a Dois", price: 90000 },
  "carta-perfume": { name: "Carta & Perfume", price: 30000 },
};

router.post("/orders", async (req, res): Promise<void> => {
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid order request");
    res.status(400).json({ error: "Verifique os dados do pedido e tente novamente." });
    return;
  }

  const data = parsed.data;
  const items = [];
  for (const item of data.items) {
    const product = catalog[item.productId];
    if (!product) {
      req.log.warn({ productId: item.productId }, "Unavailable product in order");
      res.status(400).json({ error: "Um ou mais produtos já não estão disponíveis." });
      return;
    }
    items.push({
      productId: item.productId,
      name: product.name,
      quantity: item.quantity,
      unitPrice: product.price,
    });
  }

  const total = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const [order] = await db
    .insert(ordersTable)
    .values({
      customerName: data.customerName,
      recipientName: data.recipientName,
      phone: data.phone,
      email: data.email ?? null,
      occasion: data.occasion,
      deliveryAddress: data.deliveryAddress,
      eventDate: data.eventDate ? data.eventDate.toISOString().slice(0, 10) : null,
      note: data.note ?? null,
      items,
      total,
      status: "new",
    })
    .returning();

  res.status(201).json(
    CreateOrderResponse.parse({
      id: order.id,
      customerName: order.customerName,
      recipientName: order.recipientName,
      phone: order.phone,
      email: order.email,
      occasion: order.occasion,
      deliveryAddress: order.deliveryAddress,
      eventDate: order.eventDate,
      note: order.note,
      items: order.items,
      total: order.total,
      status: order.status,
      createdAt: order.createdAt,
    }),
  );
});

export default router;
