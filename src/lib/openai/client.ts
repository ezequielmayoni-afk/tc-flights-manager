import OpenAI from 'openai'

let openaiClient: OpenAI | null = null

export function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set')
    }
    openaiClient = new OpenAI({ apiKey })
  }
  return openaiClient
}

export interface SEOContent {
  seo_title: string
  seo_description: string
  seo_keywords: string
  meta_title: string
  meta_description: string
  image_alt: string
}

export interface PackageDataForSEO {
  // Basic info
  title: string
  large_title: string | null
  destinations: string
  price: number
  currency: string
  nights: number
  adults: number
  children: number
  departure_date: string | null
  date_range: string | null
  themes: string[]

  // Origin
  origin_city: string | null
  origin_country: string | null

  // Hotel info
  hotel_name: string | null
  hotel_category: string | null
  hotel_stars: number | null
  room_type: string | null
  board_type: string | null // ALL INCLUSIVE, DESAYUNO, etc.
  hotel_nights: number | null
  hotel_address: string | null

  // Flight info
  airline: string | null
  airline_code: string | null
  flight_departure: string | null
  flight_arrival: string | null
  cabin_class: string | null
  baggage_info: string | null

  // Counts
  hotels_count: number
  transfers_count: number
  flights_count: number

  // Inclusions summary
  includes_flights: boolean
  includes_hotel: boolean
  includes_transfers: boolean
  includes_all_inclusive: boolean
}

export async function generateSEOContent(
  packageData: PackageDataForSEO,
  promptTemplate: string
): Promise<SEOContent> {
  const client = getOpenAIClient()

  // Replace placeholders in prompt template
  const prompt = promptTemplate
    // Basic info
    .replace(/{title}/g, packageData.title || '')
    .replace(/{large_title}/g, packageData.large_title || packageData.title || '')
    .replace(/{destinations}/g, packageData.destinations || '')
    .replace(/{price}/g, packageData.price?.toString() || '0')
    .replace(/{currency}/g, packageData.currency || 'USD')
    .replace(/{nights}/g, packageData.nights?.toString() || '0')
    .replace(/{adults}/g, packageData.adults?.toString() || '2')
    .replace(/{children}/g, packageData.children?.toString() || '0')
    .replace(/{departure_date}/g, packageData.departure_date || 'Flexible')
    .replace(/{date_range}/g, packageData.date_range || '')
    .replace(/{themes}/g, packageData.themes?.join(', ') || '')
    // Origin
    .replace(/{origin_city}/g, packageData.origin_city || '')
    .replace(/{origin_country}/g, packageData.origin_country || '')
    // Hotel info
    .replace(/{hotel_name}/g, packageData.hotel_name || '')
    .replace(/{hotel_category}/g, packageData.hotel_category || '')
    .replace(/{hotel_stars}/g, packageData.hotel_stars?.toString() || '')
    .replace(/{room_type}/g, packageData.room_type || '')
    .replace(/{board_type}/g, packageData.board_type || '')
    .replace(/{hotel_nights}/g, packageData.hotel_nights?.toString() || '')
    .replace(/{hotel_address}/g, packageData.hotel_address || '')
    // Flight info
    .replace(/{airline}/g, packageData.airline || '')
    .replace(/{airline_code}/g, packageData.airline_code || '')
    .replace(/{flight_departure}/g, packageData.flight_departure || '')
    .replace(/{flight_arrival}/g, packageData.flight_arrival || '')
    .replace(/{cabin_class}/g, packageData.cabin_class || '')
    .replace(/{baggage_info}/g, packageData.baggage_info || '')
    // Counts
    .replace(/{hotels_count}/g, packageData.hotels_count?.toString() || '0')
    .replace(/{transfers_count}/g, packageData.transfers_count?.toString() || '0')
    .replace(/{flights_count}/g, packageData.flights_count?.toString() || '0')
    // Booleans as text
    .replace(/{includes_flights}/g, packageData.includes_flights ? 'Sí' : 'No')
    .replace(/{includes_hotel}/g, packageData.includes_hotel ? 'Sí' : 'No')
    .replace(/{includes_transfers}/g, packageData.includes_transfers ? 'Sí' : 'No')
    .replace(/{includes_all_inclusive}/g, packageData.includes_all_inclusive ? 'Sí' : 'No')

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.7,
    max_tokens: 500,
  })

  const content = response.choices[0]?.message?.content
  if (!content) {
    throw new Error('No response from OpenAI')
  }

  // Parse JSON response
  try {
    // Remove markdown code blocks if present
    const cleanContent = content
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim()

    const seoContent = JSON.parse(cleanContent) as SEOContent

    // Validate and truncate if needed
    return {
      seo_title: (seoContent.seo_title || '').substring(0, 60),
      seo_description: (seoContent.seo_description || '').substring(0, 160),
      seo_keywords: seoContent.seo_keywords || '',
      meta_title: (seoContent.meta_title || '').substring(0, 60),
      meta_description: (seoContent.meta_description || '').substring(0, 155),
      image_alt: seoContent.image_alt || '',
    }
  } catch (error) {
    console.error('Failed to parse OpenAI response:', content)
    throw new Error('Failed to parse SEO content from OpenAI response')
  }
}
