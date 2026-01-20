// Meta Marketing API Client
import type {
  MetaAPICampaign,
  MetaAPIAdSet,
  MetaAPIAdCreativeParams,
  MetaAPIAdParams,
  MetaAPIInsight,
  DatePreset,
} from './types'
import { metaCache, CACHE_KEYS, CACHE_TTL } from '../cache/meta-cache'

const META_API_VERSION = 'v21.0'
const META_API_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`

// Default timeout for API requests (30 seconds)
const DEFAULT_TIMEOUT_MS = 30000

// Environment variables
const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN!
const AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID!
const PAGE_ID = process.env.META_PAGE_ID!

// Singleton instance
let clientInstance: MetaAdsClient | null = null

export function getMetaAdsClient(): MetaAdsClient {
  if (!clientInstance) {
    if (!ACCESS_TOKEN) {
      throw new Error('META_ACCESS_TOKEN environment variable is required')
    }
    if (!AD_ACCOUNT_ID) {
      throw new Error('META_AD_ACCOUNT_ID environment variable is required')
    }
    if (!PAGE_ID) {
      throw new Error('META_PAGE_ID environment variable is required')
    }
    clientInstance = new MetaAdsClient(ACCESS_TOKEN, AD_ACCOUNT_ID, PAGE_ID)
  }
  return clientInstance
}

export class MetaAdsClient {
  private accessToken: string
  private adAccountId: string
  private pageId: string

  constructor(accessToken: string, adAccountId: string, pageId: string) {
    this.accessToken = accessToken
    // Ensure ad account ID has 'act_' prefix
    this.adAccountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`
    this.pageId = pageId
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    timeoutMs: number = DEFAULT_TIMEOUT_MS
  ): Promise<T> {
    const url = endpoint.startsWith('http')
      ? endpoint
      : `${META_API_BASE_URL}${endpoint}`

    const separator = url.includes('?') ? '&' : '?'
    const fullUrl = `${url}${separator}access_token=${this.accessToken}`

    // Setup timeout with AbortController
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(fullUrl, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error('[Meta API] Error response:', JSON.stringify(errorData, null, 2))
        const errorMessage = errorData.error?.message || response.statusText
        const errorCode = errorData.error?.code || 'unknown'
        const errorType = errorData.error?.type || 'unknown'
        throw new Error(`Meta API Error (${errorCode}/${errorType}): ${errorMessage}`)
      }

      return response.json()
    } catch (error) {
      clearTimeout(timeoutId)

      // Handle timeout specifically
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Meta API timeout después de ${timeoutMs}ms: ${endpoint}`)
      }

      throw error
    }
  }

  private async requestWithFormData<T>(
    endpoint: string,
    formData: FormData,
    timeoutMs: number = DEFAULT_TIMEOUT_MS
  ): Promise<T> {
    const url = `${META_API_BASE_URL}${endpoint}`
    formData.append('access_token', this.accessToken)

    // Setup timeout with AbortController
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(url, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.error?.message || response.statusText
        throw new Error(`Meta API Error: ${errorMessage}`)
      }

      return response.json()
    } catch (error) {
      clearTimeout(timeoutId)

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Meta API timeout después de ${timeoutMs}ms: ${endpoint}`)
      }

      throw error
    }
  }

  // ============================================
  // CAMPAIGN METHODS
  // ============================================

  async getCampaigns(): Promise<MetaAPICampaign[]> {
    // Check cache first
    const cached = metaCache.get<MetaAPICampaign[]>(CACHE_KEYS.campaigns)
    if (cached) {
      console.log('[Meta API] Using cached campaigns')
      return cached
    }

    const fields = 'id,name,status,objective,daily_budget,lifetime_budget'
    const response = await this.request<{ data: MetaAPICampaign[] }>(
      `/${this.adAccountId}/campaigns?fields=${fields}&limit=100`
    )

    // Cache the result
    metaCache.set(CACHE_KEYS.campaigns, response.data, CACHE_TTL.campaigns)
    return response.data
  }

  async getCampaignById(campaignId: string): Promise<{ id: string; name: string; status: string; objective: string } | null> {
    try {
      const fields = 'id,name,status,objective'
      const response = await this.request<{ id: string; name: string; status: string; objective: string }>(
        `/${campaignId}?fields=${fields}`
      )
      return response
    } catch {
      return null
    }
  }

  // ============================================
  // AD SET METHODS
  // ============================================

  async getAdSets(campaignId?: string): Promise<MetaAPIAdSet[]> {
    // Check cache first
    const cacheKey = campaignId
      ? CACHE_KEYS.adsetsByCampaign(campaignId)
      : CACHE_KEYS.adsets
    const cached = metaCache.get<MetaAPIAdSet[]>(cacheKey)
    if (cached) {
      console.log(`[Meta API] Using cached adsets${campaignId ? ` for campaign ${campaignId}` : ''}`)
      return cached
    }

    const fields = 'id,campaign_id,name,status,targeting,daily_budget,bid_amount,optimization_goal'
    let endpoint = `/${this.adAccountId}/adsets?fields=${fields}&limit=100`

    if (campaignId) {
      endpoint += `&filtering=[{"field":"campaign.id","operator":"EQUAL","value":"${campaignId}"}]`
    }

    const response = await this.request<{ data: MetaAPIAdSet[] }>(endpoint)

    // Cache the result
    metaCache.set(cacheKey, response.data, CACHE_TTL.adsets)
    return response.data
  }

  async getAdSetById(adsetId: string): Promise<{ id: string; name: string; status: string; campaign_id: string } | null> {
    try {
      const fields = 'id,name,status,campaign_id'
      const response = await this.request<{ id: string; name: string; status: string; campaign_id: string }>(
        `/${adsetId}?fields=${fields}`
      )
      return response
    } catch {
      return null
    }
  }

  async getAdSetsByCampaign(campaignId: string): Promise<MetaAPIAdSet[]> {
    const fields = 'id,name,status,targeting,daily_budget,bid_amount,optimization_goal'
    const response = await this.request<{ data: MetaAPIAdSet[] }>(
      `/${campaignId}/adsets?fields=${fields}&limit=100`
    )
    return response.data.map(adset => ({ ...adset, campaign_id: campaignId }))
  }

  /**
   * Create a new AdSet for Dynamic Creative ads
   * Copies targeting and budget from a template AdSet
   */
  async createAdSetFromTemplate(options: {
    templateAdSetId: string
    campaignId: string
    name: string
    status?: string
  }): Promise<string> {
    // First, get the template AdSet to copy settings
    const templateFields = 'targeting,daily_budget,lifetime_budget,bid_amount,billing_event,optimization_goal,destination_type,promoted_object,bid_strategy'
    const template = await this.request<{
      targeting?: Record<string, unknown>
      daily_budget?: string
      lifetime_budget?: string
      bid_amount?: string
      billing_event?: string
      optimization_goal?: string
      destination_type?: string
      promoted_object?: Record<string, unknown>
      bid_strategy?: string
    }>(`/${options.templateAdSetId}?fields=${templateFields}`)

    // Build the new AdSet params
    const params: Record<string, unknown> = {
      name: options.name,
      campaign_id: options.campaignId,
      status: options.status || 'PAUSED',
      billing_event: template.billing_event || 'IMPRESSIONS',
      optimization_goal: template.optimization_goal || 'REACH',
    }

    // Copy targeting if available
    if (template.targeting) {
      params.targeting = template.targeting
    }

    // Copy budget - only one type, not both
    // daily_budget takes priority; only use lifetime_budget if it's non-zero and no daily_budget
    if (template.daily_budget && template.daily_budget !== '0') {
      params.daily_budget = template.daily_budget
    } else if (template.lifetime_budget && template.lifetime_budget !== '0') {
      params.lifetime_budget = template.lifetime_budget
    }

    // Copy bid strategy (LOWEST_COST_WITHOUT_CAP, etc.)
    if (template.bid_strategy) {
      params.bid_strategy = template.bid_strategy
    }

    // Copy bid amount if available
    if (template.bid_amount) {
      params.bid_amount = template.bid_amount
    }

    // Copy destination type for messaging campaigns
    if (template.destination_type) {
      params.destination_type = template.destination_type
    }

    // Copy promoted object (contains page_id for messaging campaigns)
    if (template.promoted_object) {
      params.promoted_object = template.promoted_object
    }

    console.log('[Meta API] Creating AdSet with params:', JSON.stringify(params, null, 2))

    const response = await this.request<{ id: string }>(
      `/${this.adAccountId}/adsets`,
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    )

    if (!response.id) {
      throw new Error('Failed to create AdSet')
    }

    return response.id
  }

  /**
   * OPTIMIZED: Get ALL ad sets from the account in a single paginated request
   * This makes 1-2 API calls instead of 100+ calls for 100+ campaigns
   */
  async getAllAdSets(): Promise<MetaAPIAdSet[]> {
    // Check cache first
    const cached = metaCache.get<MetaAPIAdSet[]>(CACHE_KEYS.adsets)
    if (cached) {
      console.log('[Meta API] Using cached ALL adsets')
      return cached
    }

    const fields = 'id,campaign_id,name,status,targeting,daily_budget,bid_amount,optimization_goal'
    const allAdSets: MetaAPIAdSet[] = []

    let url = `/${this.adAccountId}/adsets?fields=${fields}&limit=500`

    console.log('[Meta API] Fetching ALL adsets using optimized account-level endpoint...')

    while (url) {
      const response = await this.request<{
        data: MetaAPIAdSet[]
        paging?: { next?: string }
      }>(url)

      allAdSets.push(...response.data)
      console.log(`[Meta API] Fetched ${allAdSets.length} adsets so far...`)

      // Get next page URL if exists
      url = response.paging?.next || ''
      if (url) {
        // Remove base URL since request() adds it
        url = url.replace(META_API_BASE_URL, '')
        // Remove access_token since request() adds it
        url = url.replace(/&access_token=[^&]+/, '')
      }
    }

    console.log(`[Meta API] Done! Total adsets: ${allAdSets.length}`)

    // Cache the result
    metaCache.set(CACHE_KEYS.adsets, allAdSets, CACHE_TTL.adsets)
    return allAdSets
  }

  // ============================================
  // CREATIVE UPLOAD METHODS
  // ============================================

  async uploadImage(imageBuffer: Buffer, filename: string): Promise<string> {
    // Meta API requires bytes as base64 encoded string
    const base64Image = imageBuffer.toString('base64')

    // Use JSON body instead of FormData for base64 upload
    const response = await this.request<{ images: Record<string, { hash: string }> }>(
      `/${this.adAccountId}/adimages`,
      {
        method: 'POST',
        body: JSON.stringify({
          filename,
          bytes: base64Image,
        }),
      }
    )

    // The response contains a hash keyed by filename
    const imageData = Object.values(response.images)[0]
    if (!imageData?.hash) {
      throw new Error('Failed to get image hash from Meta API response')
    }

    return imageData.hash
  }

  /**
   * Get image URLs from Meta by their hashes
   * Returns a map of hash -> URL
   * OPTIMIZED: Uses caching to reduce API calls
   */
  async getImageUrls(hashes: string[]): Promise<Record<string, string>> {
    if (hashes.length === 0) return {}

    const result: Record<string, string> = {}
    const uncachedHashes: string[] = []

    // Check cache first for each hash
    for (const hash of hashes) {
      const cacheKey = CACHE_KEYS.imageThumbnail(hash)
      const cached = metaCache.get<string>(cacheKey)
      if (cached) {
        result[hash] = cached
      } else {
        uncachedHashes.push(hash)
      }
    }

    if (uncachedHashes.length === 0) {
      console.log(`[Meta API] All ${hashes.length} image URLs from cache`)
      return result
    }

    console.log(`[Meta API] Fetching ${uncachedHashes.length} image URLs (${hashes.length - uncachedHashes.length} from cache)`)

    const hashesParam = encodeURIComponent(JSON.stringify(uncachedHashes))
    const response = await this.request<{
      data: Array<{
        hash: string
        url: string
        url_128?: string
        permalink_url?: string
      }>
    }>(`/${this.adAccountId}/adimages?hashes=${hashesParam}&fields=hash,url,url_128,permalink_url`)

    for (const img of response.data) {
      // Prefer url_128 for thumbnails, fallback to url
      const thumbnailUrl = img.url_128 || img.url
      result[img.hash] = thumbnailUrl
      // Cache the URL
      metaCache.set(CACHE_KEYS.imageThumbnail(img.hash), thumbnailUrl, CACHE_TTL.imageThumbnail)
    }

    return result
  }

  /**
   * Get video thumbnail URLs from Meta by their video IDs
   * Returns a map of videoId -> thumbnailUrl
   * OPTIMIZED: Uses parallel requests in batches + caching
   */
  async getVideoThumbnails(videoIds: string[]): Promise<Record<string, string>> {
    if (videoIds.length === 0) return {}

    const result: Record<string, string> = {}
    const uncachedIds: string[] = []

    // Check cache first for each video
    for (const videoId of videoIds) {
      const cacheKey = CACHE_KEYS.videoThumbnail(videoId)
      const cached = metaCache.get<string>(cacheKey)
      if (cached) {
        result[videoId] = cached
      } else {
        uncachedIds.push(videoId)
      }
    }

    if (uncachedIds.length === 0) {
      console.log(`[Meta API] All ${videoIds.length} video thumbnails from cache`)
      return result
    }

    console.log(`[Meta API] Fetching ${uncachedIds.length} video thumbnails (${videoIds.length - uncachedIds.length} from cache)`)

    // Process in parallel batches of 10 to avoid rate limits
    const BATCH_SIZE = 10
    for (let i = 0; i < uncachedIds.length; i += BATCH_SIZE) {
      const batch = uncachedIds.slice(i, i + BATCH_SIZE)

      const batchPromises = batch.map(async (videoId) => {
        try {
          const response = await this.request<{
            thumbnails: {
              data: Array<{
                uri: string
                width: number
                height: number
              }>
            }
          }>(`/${videoId}?fields=thumbnails`)

          if (response.thumbnails?.data?.length > 0) {
            const thumbnailUrl = response.thumbnails.data[0].uri
            // Cache the thumbnail (thumbnails rarely change, cache for 1 hour)
            metaCache.set(CACHE_KEYS.videoThumbnail(videoId), thumbnailUrl, 60 * 60 * 1000)
            return { videoId, thumbnailUrl }
          }
          return { videoId, thumbnailUrl: null }
        } catch (error) {
          console.warn(`[Meta API] Failed to get thumbnail for video ${videoId}:`, error)
          return { videoId, thumbnailUrl: null }
        }
      })

      const batchResults = await Promise.all(batchPromises)

      for (const { videoId, thumbnailUrl } of batchResults) {
        if (thumbnailUrl) {
          result[videoId] = thumbnailUrl
        }
      }
    }

    return result
  }

  async uploadVideo(
    videoBuffer: Buffer,
    filename: string,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    // For videos, we need to use the resumable upload API for large files
    // or direct upload for smaller files (<100MB)

    const formData = new FormData()
    const blob = new Blob([new Uint8Array(videoBuffer)], { type: 'video/mp4' })
    formData.append('source', blob, filename)
    formData.append('title', filename)

    const response = await this.requestWithFormData<{ id: string }>(
      `/${this.adAccountId}/advideos`,
      formData
    )

    if (!response.id) {
      throw new Error('Failed to get video ID from Meta API response')
    }

    // If progress callback provided, call it with 100% as video is uploaded
    if (onProgress) {
      onProgress(100)
    }

    return response.id
  }

  // ============================================
  // AD CREATIVE METHODS
  // ============================================

  async createAdCreative(params: MetaAPIAdCreativeParams): Promise<string> {
    const response = await this.request<{ id: string }>(
      `/${this.adAccountId}/adcreatives`,
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    )

    if (!response.id) {
      throw new Error('Failed to create ad creative')
    }

    return response.id
  }

  async createImageAdCreative(options: {
    name: string
    imageHash: string
    message: string
    headline: string
    description?: string
    link: string
    ctaType: string
    whatsappNumber?: string
  }): Promise<string> {
    const params: MetaAPIAdCreativeParams = {
      name: options.name,
      object_story_spec: {
        page_id: this.pageId,
        link_data: {
          link: options.link,
          message: options.message,
          name: options.headline,
          description: options.description,
          image_hash: options.imageHash,
          call_to_action: {
            type: options.ctaType,
            value: options.whatsappNumber
              ? { whatsapp_number: options.whatsappNumber }
              : { link: options.link },
          },
        },
      },
    }

    return this.createAdCreative(params)
  }

  async createVideoAdCreative(options: {
    name: string
    videoId: string
    message: string
    headline: string
    description?: string
    link: string
    ctaType: string
    whatsappNumber?: string
  }): Promise<string> {
    const params: MetaAPIAdCreativeParams = {
      name: options.name,
      object_story_spec: {
        page_id: this.pageId,
        link_data: {
          link: options.link,
          message: options.message,
          name: options.headline,
          description: options.description,
          video_id: options.videoId,
          call_to_action: {
            type: options.ctaType,
            value: options.whatsappNumber
              ? { whatsapp_number: options.whatsappNumber }
              : { link: options.link },
          },
        },
      },
    }

    return this.createAdCreative(params)
  }

  // ============================================
  // AD METHODS
  // ============================================

  async createAd(params: MetaAPIAdParams): Promise<string> {
    const response = await this.request<{ id: string }>(
      `/${this.adAccountId}/ads`,
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    )

    if (!response.id) {
      throw new Error('Failed to create ad')
    }

    return response.id
  }

  async createAdFromCreative(options: {
    name: string
    adsetId: string
    creativeId: string
    status?: string
    pixelId?: string
  }): Promise<string> {
    // Default pixel ID for waaba general events
    const WAABA_PIXEL_ID = '1310175447121594'

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const params: Record<string, any> = {
      name: options.name,
      adset_id: options.adsetId,
      creative: {
        creative_id: options.creativeId,
      },
      status: options.status || 'ACTIVE',
      // Website events tracking - always enabled with waaba pixel
      tracking_specs: [
        {
          'action.type': ['offsite_conversion'],
          'fb_pixel': [options.pixelId || WAABA_PIXEL_ID]
        }
      ]
    }

    console.log('[Meta API] Creating ad with params:', JSON.stringify(params, null, 2))

    try {
      return await this.createAd(params as MetaAPIAdParams)
    } catch (error) {
      console.error('[Meta API] Failed to create ad. Params:', JSON.stringify(params))
      console.error('[Meta API] Error:', error)
      throw error
    }
  }

  /**
   * Create an ad creative with placement asset customization
   * - Different images/videos for different placements (4x5 for feed, 9x16 for stories/reels)
   * - Multiple bodies and titles (up to 5 each)
   * - WhatsApp message template (page_welcome_message)
   * - Supports both images (hash) and videos (id)
   */
  async createWhatsAppAdCreative(options: {
    name: string
    // Image support (hash-based)
    imageHash4x5?: string      // Square/Feed image
    imageHash9x16?: string     // Vertical/Stories image (optional)
    // Video support (id-based)
    videoId4x5?: string        // Square/Feed video
    videoId9x16?: string       // Vertical/Stories video (optional)
    copies: Array<{
      primary_text: string
      headline: string
      description?: string
    }>
    waMessageTemplate: string  // The autofill message for WhatsApp
    tcPackageId: number        // For template naming
    instagramUserId?: string   // Optional Instagram account ID
  }): Promise<string> {
    // Determine media type for each aspect ratio independently
    // This allows mixing images and videos in the same creative
    const is4x5Video = !!options.videoId4x5
    const is9x16Video = !!options.videoId9x16
    const hasMedia4x5 = options.videoId4x5 || options.imageHash4x5
    const hasMedia9x16 = options.videoId9x16 || options.imageHash9x16

    if (!hasMedia4x5) {
      throw new Error('Either imageHash4x5 or videoId4x5 is required')
    }

    // Generate unique label names
    const timestamp = Date.now()
    const generateLabel = (prefix: string, index: number) => `${prefix}_${timestamp}_${index}`

    // IMPORTANT: For text rotation, ALL bodies/titles that should rotate together
    // must share the SAME adlabel. This tells Meta to rotate between them.
    const bodyLabel = generateLabel('body', 0)  // Same label for ALL bodies
    const titleLabel = generateLabel('title', 0) // Same label for ALL titles

    // Build bodies with THE SAME adlabel (for rotation)
    // Format: headline + 2 line breaks + primary_text
    const bodies = options.copies.map((copy) => ({
      text: `${copy.headline}\n\n${copy.primary_text}`,
      adlabels: [{ name: bodyLabel }]
    }))

    // Build titles with THE SAME adlabel (for rotation)
    const titles = options.copies.map((copy) => ({
      text: copy.headline,
      adlabels: [{ name: titleLabel }]
    }))

    // Labels for media (feed and stories) - use appropriate prefix based on media type
    const feedLabel = generateLabel(is4x5Video ? 'vid_feed' : 'img_feed', 0)
    const storiesLabel = generateLabel(is9x16Video ? 'vid_stories' : 'img_stories', 1)

    // Build media arrays - can have both images and videos
    const images: Array<{ hash: string; adlabels: Array<{ name: string }> }> = []
    const videos: Array<{ video_id: string; adlabels: Array<{ name: string }> }> = []

    // 4x5 media (feed)
    if (is4x5Video) {
      videos.push({
        video_id: options.videoId4x5!,
        adlabels: [{ name: feedLabel }]
      })
    } else if (options.imageHash4x5) {
      images.push({
        hash: options.imageHash4x5,
        adlabels: [{ name: feedLabel }]
      })
    }

    // 9x16 media (stories/reels)
    if (is9x16Video) {
      videos.push({
        video_id: options.videoId9x16!,
        adlabels: [{ name: storiesLabel }]
      })
    } else if (options.imageHash9x16) {
      images.push({
        hash: options.imageHash9x16,
        adlabels: [{ name: storiesLabel }]
      })
    }

    // Build link URL with adlabel
    const linkLabel = generateLabel('link', 0)
    const linkUrls = [{
      website_url: 'https://api.whatsapp.com/send',
      display_url: '',
      adlabels: [{ name: linkLabel }]
    }]

    // Build asset_customization_rules for placement mapping
    // Meta requires at least 2 customization rules for placement asset customization
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const assetCustomizationRules: Array<Record<string, any>> = []

    // Rule 1: Feed placements (use 4x5 media)
    const feedMediaLabelKey = is4x5Video ? 'video_label' : 'image_label'
    assetCustomizationRules.push({
      customization_spec: {
        publisher_platforms: ['facebook', 'instagram', 'messenger'],
        facebook_positions: ['feed', 'profile_feed', 'notification', 'instream_video', 'marketplace', 'search'],
        instagram_positions: ['stream', 'explore', 'explore_home', 'profile_feed'],
        messenger_positions: ['messenger_home']
      },
      [feedMediaLabelKey]: { name: feedLabel },
      body_label: { name: bodyLabel },
      title_label: { name: titleLabel },
      link_url_label: { name: linkLabel },
      priority: 1
    })

    // Rule 2: Stories/Reels (use 9x16 media if available, otherwise fallback to 4x5)
    const hasStories9x16 = hasMedia9x16
    const storiesMediaLabel = hasStories9x16 ? storiesLabel : feedLabel
    const storiesMediaLabelKey = hasStories9x16
      ? (is9x16Video ? 'video_label' : 'image_label')
      : feedMediaLabelKey // fallback to same type as feed
    assetCustomizationRules.push({
      customization_spec: {
        publisher_platforms: ['facebook', 'instagram', 'whatsapp'],
        facebook_positions: ['facebook_reels', 'story'],
        instagram_positions: ['profile_reels', 'story', 'reels'],
        whatsapp_positions: ['status']
      },
      [storiesMediaLabelKey]: { name: storiesMediaLabel },
      body_label: { name: bodyLabel },
      title_label: { name: titleLabel },
      link_url_label: { name: linkLabel },
      priority: 2
    })

    // Build the page_welcome_message (WhatsApp template)
    const pageWelcomeMessage = JSON.stringify({
      type: 'VISUAL_EDITOR',
      version: 2,
      landing_screen_type: 'welcome_message',
      media_type: 'text',
      text_format: {
        customer_action_type: 'autofill_message',
        message: {
          autofill_message: {
            content: options.waMessageTemplate
          },
          text: '.'
        }
      },
      user_edit: true,
      surface: 'visual_editor_new',
      welcome_message_edited: true,
      autofill_message_edited: true
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const assetFeedSpec: Record<string, any> = {
      bodies,
      titles,
      link_urls: linkUrls,
      call_to_action_types: ['WHATSAPP_MESSAGE'],
      call_to_actions: [{
        type: 'WHATSAPP_MESSAGE',
        value: { app_destination: 'WHATSAPP' }
      }],
      ad_formats: ['AUTOMATIC_FORMAT'],
      asset_customization_rules: assetCustomizationRules,
      optimization_type: 'PLACEMENT',
      additional_data: {
        multi_share_end_card: false,
        page_welcome_message: pageWelcomeMessage,
        is_click_to_message: false
      }
    }

    // Add images and/or videos to the asset_feed_spec
    // Can have both if mixing image and video across aspect ratios
    if (images.length > 0) {
      assetFeedSpec.images = images
    }
    if (videos.length > 0) {
      assetFeedSpec.videos = videos
    }

    // Always use simple empty description without adlabels
    assetFeedSpec.descriptions = [{ text: '' }]

    // Build object_story_spec
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const objectStorySpec: Record<string, any> = {
      page_id: this.pageId
    }
    if (options.instagramUserId) {
      objectStorySpec.instagram_user_id = options.instagramUserId
    }

    const params = {
      name: options.name,
      object_story_spec: objectStorySpec,
      asset_feed_spec: assetFeedSpec
    }

    const mediaType = videos.length > 0 && images.length > 0 ? 'MIXED' : (videos.length > 0 ? 'VIDEO' : 'IMAGE')
    console.log(`[Meta API] Creating WhatsApp ad creative (${mediaType}):`)
    console.log('[Meta API] Params:', JSON.stringify(params, null, 2))

    try {
      const response = await this.request<{ id: string }>(
        `/${this.adAccountId}/adcreatives`,
        {
          method: 'POST',
          body: JSON.stringify(params),
        }
      )
      return response.id
    } catch (error) {
      console.error('[Meta API] Full params that failed:', JSON.stringify(params))
      throw error
    }
  }


  async updateAdStatus(adId: string, status: string): Promise<void> {
    await this.request(`/${adId}`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    })
  }

  /**
   * Get ads by AdSet ID - used to sync with our database
   */
  async getAdsByAdSet(adsetId: string): Promise<Array<{
    id: string
    name: string
    status: string
    effective_status: string
    creative: { id: string } | null
    created_time: string
  }>> {
    const fields = 'id,name,status,effective_status,creative{id},created_time'
    const response = await this.request<{
      data: Array<{
        id: string
        name: string
        status: string
        effective_status: string
        creative?: { id: string }
        created_time: string
      }>
    }>(`/${adsetId}/ads?fields=${fields}&limit=100`)

    return response.data.map(ad => ({
      ...ad,
      creative: ad.creative || null
    }))
  }

  /**
   * Get a single ad by ID to check if it exists
   */
  async getAdById(adId: string): Promise<{
    id: string
    name: string
    status: string
    effective_status: string
  } | null> {
    try {
      const fields = 'id,name,status,effective_status'
      return await this.request<{
        id: string
        name: string
        status: string
        effective_status: string
      }>(`/${adId}?fields=${fields}`)
    } catch {
      // Ad doesn't exist or was deleted
      return null
    }
  }

  /**
   * Update an existing ad's creative
   * This creates a new creative and updates the ad to use it
   */
  async updateAdCreative(adId: string, newCreativeId: string): Promise<void> {
    await this.request(`/${adId}`, {
      method: 'POST',
      body: JSON.stringify({
        creative: { creative_id: newCreativeId }
      }),
    })
  }

  /**
   * Delete an ad
   */
  async deleteAd(adId: string): Promise<void> {
    await this.request(`/${adId}`, {
      method: 'DELETE',
    })
  }

  /**
   * Get ALL ads from the account (for syncing historical data)
   */
  async getAllAds(): Promise<Array<{
    id: string
    name: string
    status: string
    adset_id: string
    campaign_id: string
    created_time: string
  }>> {
    const fields = 'id,name,status,adset_id,campaign_id,created_time'
    const allAds: Array<{
      id: string
      name: string
      status: string
      adset_id: string
      campaign_id: string
      created_time: string
    }> = []

    let url = `/${this.adAccountId}/ads?fields=${fields}&limit=500`

    // Paginate through all ads
    while (url) {
      const response = await this.request<{
        data: Array<{
          id: string
          name: string
          status: string
          adset_id: string
          campaign_id: string
          created_time: string
        }>
        paging?: { next?: string }
      }>(url)

      allAds.push(...response.data)

      // Get next page URL if exists
      url = response.paging?.next || ''
      if (url) {
        // Remove base URL since request() adds it
        url = url.replace(META_API_BASE_URL, '')
        // Remove access_token since request() adds it
        url = url.replace(/&access_token=[^&]+/, '')
      }
    }

    return allAds
  }

  // ============================================
  // INSIGHTS METHODS
  // ============================================

  async getAdInsights(
    adIds: string[],
    datePreset: DatePreset = 'last_7d'
  ): Promise<MetaAPIInsight[]> {
    // Request ALL available fields for complete AI analysis
    const fields = [
      // Basic identifiers
      'ad_id',
      'date_start',
      'date_stop',
      // Core metrics
      'impressions',
      'reach',
      'frequency',
      'spend',
      // Click metrics
      'clicks',
      'unique_clicks',
      'cpc',
      'cpm',
      'ctr',
      'unique_ctr',
      'cost_per_unique_click',
      'inline_link_clicks',
      'inline_link_click_ctr',
      'outbound_clicks',
      // Video metrics
      'video_p25_watched_actions',
      'video_p50_watched_actions',
      'video_p75_watched_actions',
      'video_p100_watched_actions',
      'video_avg_time_watched_actions',
      'video_play_actions',
      // Quality ranking
      'quality_ranking',
      'engagement_rate_ranking',
      'conversion_rate_ranking',
      // Actions and costs (includes leads, messages, purchases, etc.)
      'actions',
      'cost_per_action_type',
      'conversions',
      'conversion_values',
      'cost_per_conversion',
      // Social engagement
      'social_spend',
    ].join(',')

    const allInsights: MetaAPIInsight[] = []

    // Fetch insights for each ad (batch in groups of 50)
    for (let i = 0; i < adIds.length; i += 50) {
      const batch = adIds.slice(i, i + 50)
      const batchPromises = batch.map(async (adId) => {
        try {
          const response = await this.request<{ data: MetaAPIInsight[] }>(
            `/${adId}/insights?fields=${fields}&date_preset=${datePreset}`
          )
          return response.data.map((insight) => ({ ...insight, ad_id: adId }))
        } catch (error) {
          console.warn(`Failed to get insights for ad ${adId}:`, error)
          return []
        }
      })

      const batchResults = await Promise.all(batchPromises)
      allInsights.push(...batchResults.flat())
    }

    return allInsights
  }

  /**
   * OPTIMIZED: Get insights for ALL ads using account-level endpoint with pagination
   * This makes 1-2 API calls instead of 74+ calls for 3700 ads
   */
  async getAllAdInsightsOptimized(datePreset: DatePreset = 'last_7d'): Promise<MetaAPIInsight[]> {
    // Request ALL available fields for complete AI analysis
    const fields = [
      // Basic identifiers
      'ad_id',
      'date_start',
      'date_stop',
      // Core metrics
      'impressions',
      'reach',
      'frequency',
      'spend',
      // Click metrics
      'clicks',
      'unique_clicks',
      'cpc',
      'cpm',
      'ctr',
      'unique_ctr',
      'cost_per_unique_click',
      'inline_link_clicks',
      'inline_link_click_ctr',
      'outbound_clicks',
      // Video metrics
      'video_p25_watched_actions',
      'video_p50_watched_actions',
      'video_p75_watched_actions',
      'video_p100_watched_actions',
      'video_avg_time_watched_actions',
      'video_play_actions',
      // Quality ranking
      'quality_ranking',
      'engagement_rate_ranking',
      'conversion_rate_ranking',
      // Actions and costs (includes leads, messages, purchases, etc.)
      'actions',
      'cost_per_action_type',
      'conversions',
      'conversion_values',
      'cost_per_conversion',
      // Social engagement
      'social_spend',
    ].join(',')

    const allInsights: MetaAPIInsight[] = []

    // Use account-level endpoint with level=ad (fetches ALL ads in single paginated request)
    let url = `/${this.adAccountId}/insights?fields=${fields}&date_preset=${datePreset}&level=ad&limit=500`

    console.log('[Meta API] Fetching ALL ad insights using optimized account-level endpoint...')

    while (url) {
      const response = await this.request<{
        data: MetaAPIInsight[]
        paging?: { next?: string }
      }>(url)

      allInsights.push(...response.data)
      console.log(`[Meta API] Fetched ${allInsights.length} insights so far...`)

      // Get next page URL if exists
      url = response.paging?.next || ''
      if (url) {
        // Remove base URL since request() adds it
        url = url.replace(META_API_BASE_URL, '')
        // Remove access_token since request() adds it
        url = url.replace(/&access_token=[^&]+/, '')
      }
    }

    console.log(`[Meta API] Done! Total insights: ${allInsights.length}`)
    return allInsights
  }

  async getAccountInsights(datePreset: DatePreset = 'last_7d'): Promise<MetaAPIInsight[]> {
    const fields = [
      'date_start',
      'date_stop',
      'impressions',
      'reach',
      'clicks',
      'spend',
      'actions',
      'cpm',
      'cpc',
      'ctr',
    ].join(',')

    const response = await this.request<{ data: MetaAPIInsight[] }>(
      `/${this.adAccountId}/insights?fields=${fields}&date_preset=${datePreset}&level=ad`
    )

    return response.data
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  getPageId(): string {
    return this.pageId
  }

  getAdAccountId(): string {
    return this.adAccountId
  }

  // Parse actions array from insights to get specific metrics
  static parseInsightActions(
    actions?: Array<{ action_type: string; value: string }>
  ): { leads: number; messages: number; messagingFirstReply: number } {
    const result = { leads: 0, messages: 0, messagingFirstReply: 0 }

    if (!actions) return result

    for (const action of actions) {
      if (action.action_type === 'lead') {
        result.leads = parseInt(action.value, 10) || 0
      }
      if (action.action_type === 'onsite_conversion.messaging_conversation_started_7d') {
        result.messages = parseInt(action.value, 10) || 0
      }
      if (action.action_type === 'onsite_conversion.messaging_first_reply') {
        result.messagingFirstReply = parseInt(action.value, 10) || 0
      }
    }

    return result
  }

  // Parse cost per action from insights
  static parseCostPerAction(
    costPerAction?: Array<{ action_type: string; value: string }>
  ): { cpl: number | null } {
    if (!costPerAction) return { cpl: null }

    const leadCost = costPerAction.find((c) => c.action_type === 'lead')
    return {
      cpl: leadCost ? parseFloat(leadCost.value) : null,
    }
  }
}
