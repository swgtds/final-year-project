import fs from "fs";
import path from "path";

const csvFilePath = path.join(process.cwd(), "public", "suspicious.csv");

function readCsv() {
  if (!fs.existsSync(csvFilePath)) return [];
  const content = fs.readFileSync(csvFilePath, "utf-8");
  return content.split("\n").map((line) => line.trim()).filter(Boolean);
}

function writeCsv(plates) {
  fs.writeFileSync(csvFilePath, plates.join("\n"), "utf-8");
}

export default function handler(req, res) {
  if (req.method === "GET") {
    const plates = readCsv();
    return res.status(200).json({ plates });
  }

  if (req.method === "POST") {
    const { plate } = req.body;
    if (!plate) return res.status(400).json({ error: "Plate required" });

    const plates = readCsv();
    if (!plates.includes(plate)) {
      plates.push(plate);
      writeCsv(plates);
    }
    return res.status(200).json({ success: true, plates });
  }

  if (req.method === "DELETE") {
    const { plate } = req.body;
    if (!plate) return res.status(400).json({ error: "Plate required" });

    let plates = readCsv();
    plates = plates.filter((p) => p !== plate);
    writeCsv(plates);

    return res.status(200).json({ success: true, plates });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
