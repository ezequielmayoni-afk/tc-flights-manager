/**
 * Aerolíneas de Travel Compositor con su logo, copiadas del export de
 * `vuelos-siviajo/frontend/src/lib/airlines.ts`.
 *
 * OJO: el export original dice "Total airlines in TC: 2937" pero la tabla que
 * quedó guardada es el recorte de las que emiten en la región (34). Las que no
 * están se muestran sin logo (`airlineLogo` devuelve `src: null`): preferimos
 * eso antes que adivinar una URL de CDN que puede dar 404.
 *
 * Se importa SÓLO desde el servidor (`airlines.ts`).
 */

export interface AirlineData {
  name: string
  country: string
  logo: string
}

export const AIRLINE_DATA: Record<string, AirlineData> = {
  "4C": { name: "Latam Colombia", country: "Colombia", logo: "https://tr2storage.blob.core.windows.net/airline/cP9m6S4ppMZTLieWMG-CKHV9YLq4E6JhPC.png" },
  "A0": { name: "Avianca Argentina", country: "", logo: "https://www.gstatic.com/flights/airline_logos/70px/A0.png" },
  "AA": { name: "American Airlines", country: "United States", logo: "https://www.gstatic.com/flights/airline_logos/70px/AA.png" },
  "AC": { name: "Air Canada", country: "Canada", logo: "https://tr2storage.blob.core.windows.net/airline/e2cfc3ON0m7b-tR9xywWCTRBPprW.png" },
  "AD": { name: "Azul", country: "Brazil", logo: "https://www.gstatic.com/flights/airline_logos/70px/AD.png" },
  "AF": { name: "Air France", country: "France", logo: "https://tr2storage.blob.core.windows.net/airline/xr3rTuPIBR6C-fubCPI6u0YOblM5.png" },
  "AM": { name: "Aeroméxico", country: "Mexico", logo: "https://tr2storage.blob.core.windows.net/airline/zLxY8VpaDfOuCD4ddo-JWOBMZL2V6CFRTH.png" },
  "AR": { name: "Aerolineas Argentinas", country: "Argentina", logo: "https://tr2storage.blob.core.windows.net/airline/AR-d52b5700-0102-4558-931b-3b6211e9501d.png" },
  "AV": { name: "Avianca", country: "Colombia", logo: "https://www.gstatic.com/flights/airline_logos/70px/AV.png" },
  "BA": { name: "British Airways", country: "United Kingdom", logo: "https://www.gstatic.com/flights/airline_logos/70px/BA.png" },
  "CM": { name: "Copa Airlines", country: "Panama", logo: "https://www.gstatic.com/flights/airline_logos/70px/CM.png" },
  "DL": { name: "Delta Air Lines", country: "United States", logo: "https://www.gstatic.com/flights/airline_logos/70px/DL.png" },
  "DM": { name: "Arajet", country: "D.Rep", logo: "https://www.gstatic.com/flights/airline_logos/70px/DM.png" },
  "EK": { name: "Emirates", country: "United Arab Emirates", logo: "https://www.gstatic.com/flights/airline_logos/70px/EK.png" },
  "ET": { name: "Ethiopian Airlines", country: "Ethiopia", logo: "https://www.gstatic.com/flights/airline_logos/70px/ET.png" },
  "FO": { name: "Flybondi", country: "Argentina", logo: "https://tr2storage.blob.core.windows.net/airline/aWgQrwjsvfVF-CYx0pcE3D3aYeI1.jpeg" },
  "G3": { name: "Gol Transportes Aéreos", country: "Brazil", logo: "https://www.gstatic.com/flights/airline_logos/70px/G3.png" },
  "H2": { name: "Sky Airline", country: "Chile", logo: "https://www.gstatic.com/flights/airline_logos/70px/H2.png" },
  "I2": { name: "Iberia Express", country: "Spain", logo: "https://www.gstatic.com/flights/airline_logos/70px/I2.png" },
  "IB": { name: "Iberia Airlines", country: "Spain", logo: "https://www.gstatic.com/flights/airline_logos/70px/IB.png" },
  "JA": { name: "JetSmart", country: "Chile", logo: "https://tr2storage.blob.core.windows.net/airline/BVwH4hcvWxqO70J2XX-5424jBSB8Ljpeg.jpeg" },
  "JJ": { name: "LATAM BRAZIL", country: "Brazil", logo: "https://www.gstatic.com/flights/airline_logos/70px/JJ.png" },
  "KL": { name: "KLM Royal Dutch Airlines", country: "Netherlands", logo: "https://www.gstatic.com/flights/airline_logos/70px/KL.png" },
  "LA": { name: "LATAM", country: "Chile", logo: "https://www.gstatic.com/flights/airline_logos/70px/LA.png" },
  "LH": { name: "Lufthansa ", country: "Germany", logo: "https://tr2storage.blob.core.windows.net/airline/myfKTJtkIVkZ-HntkYWYpCvwUNzr.png" },
  "LP": { name: "LATAM PERU", country: "Peru", logo: "https://www.gstatic.com/flights/airline_logos/70px/LP.png" },
  "LU": { name: "LATAM CHILE", country: "Chile", logo: "https://www.gstatic.com/flights/airline_logos/70px/LU.png" },
  "QR": { name: "Qatar Airways", country: "Qatar", logo: "https://www.gstatic.com/flights/airline_logos/70px/QR.png" },
  "TK": { name: "Turkish Airlines", country: "Turkey", logo: "https://www.gstatic.com/flights/airline_logos/70px/TK.png" },
  "TP": { name: "TAP Air Portugal", country: "Portugal", logo: "https://www.gstatic.com/flights/airline_logos/70px/TP.png" },
  "UA": { name: "United Airlines", country: "United States", logo: "https://www.gstatic.com/flights/airline_logos/70px/UA.png" },
  "UX": { name: "Air Europa", country: "Spain", logo: "https://tr2storage.blob.core.windows.net/airline/D6ukA15mJW2BzksUFx-LCvqykiZ0NbvA7L.png" },
  "WJ": { name: "Jetsmart Airlines", country: "Argentina", logo: "https://static.travelconline.com/airline/zdy6wuG7NKPX-255424jBSB8L.jpeg" },
  "XL": { name: "LATAM ECUADOR ", country: "Ecuador", logo: "https://www.gstatic.com/flights/airline_logos/70px/XL.png" },
};
