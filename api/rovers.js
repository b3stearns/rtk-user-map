export default async function handler(req, res) {
  console.log("API route hit - returning empty for now");
  res.status(200).json([]); 
}
