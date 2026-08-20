import { Router } from "express";
import { requireShop } from "../middleware/requireShop.js";
import { proxy, passthroughQuery, seg } from "./proxy.js";

// Catalog routes for the importer. A factory that returns a router for one Apps
// API resource (products or categories), mounted at its own prefix:
//
//   GET  /api/products?page&limit&search&category&stock   list the store catalog
//   POST /api/products                                    create one product
//   GET  /api/products/:id                                one product
//   GET  /api/categories?page&limit&search                list categories
//   POST /api/categories                                  create a category
//   GET  /api/categories/:id                              one category
//
// Every route runs requireShop (shop from the signed session cookie), then
// forwards to the Salesive Apps API with the store-scoped app token and pipes the
// envelope back. Gated by READ/WRITE_INVENTORY and READ/WRITE_CATEGORIES
// respectively — see SALESIVE_SCOPES in .env.
export function createCatalogRouter({ upstream, listParams }) {
    const router = Router();
    router.use(requireShop);

    router.get("/", (req, res, next) =>
        proxy(req, res, next, {
            path: `${upstream}${passthroughQuery(req.query, listParams)}`,
        }),
    );

    router.post("/", (req, res, next) =>
        proxy(req, res, next, { path: upstream, method: "POST", body: req.body }),
    );

    router.get("/:id", (req, res, next) =>
        proxy(req, res, next, { path: `${upstream}/${seg(req.params.id)}` }),
    );

    return router;
}
