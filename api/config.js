// GET -> { needsCode, configured }. Tells the client whether to ask for the access code.
export default function handler(req, res) {
  res.status(200).json({
    needsCode: Boolean(process.env.ACCESS_CODE),
    configured: Boolean(process.env.YOUCAM_API_KEY),
  });
}
