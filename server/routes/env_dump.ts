import { Router } from "express";
const router = Router();
router.get("/dump", (req, res) => {
  res.json(Object.keys(process.env).filter(k => k.includes('FIREBASE')));
});
export default router;
