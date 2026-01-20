// Meta Marketing API Types

// ============================================
// META CAMPAIGN & AD SET TYPES
// ============================================

export type MetaCampaignStatus = 'ACTIVE' | 'PAUSED' | 'DELETED' | 'ARCHIVED'
export type MetaAdSetStatus = 'ACTIVE' | 'PAUSED' | 'DELETED' | 'ARCHIVED'
export type MetaAdStatus = 'ACTIVE' | 'PAUSED' | 'DELETED' | 'PENDING_REVIEW' | 'DISAPPROVED' | 'WITH_ISSUES'

export interface MetaCampaign {
  id: string
  meta_campaign_id: string
  name: string
  status: MetaCampaignStatus
  objective?: string
  daily_budget?: number
  lifetime_budget?: number
  currency?: string
  last_sync_at?: string
  created_at: string
}

export interface MetaAdSet {
  id: string
  meta_adset_id: string
  meta_campaign_id: string
  name: string
  status: MetaAdSetStatus
  targeting?: Record<string, unknown>
  daily_budget?: number
  bid_amount?: number
  optimization_goal?: string
  last_sync_at?: string
  created_at: string
}

export interface MetaCampaignWithAdSets extends MetaCampaign {
  adsets: MetaAdSet[]
  adsets_count: number
}

// ============================================
// META CREATIVE TYPES
// ============================================

export type AspectRatio = '4x5' | '9x16'
export type CreativeType = 'IMAGE' | 'VIDEO'
export type UploadStatus = 'pending' | 'uploading' | 'uploaded' | 'error'

export interface MetaCreative {
  id: number
  package_id: number
  tc_package_id: number
  variant: number
  aspect_ratio: AspectRatio
  drive_file_id: string
  drive_url?: string
  meta_image_hash?: string
  meta_video_id?: string
  creative_type: CreativeType
  upload_status: UploadStatus
  upload_error?: string
  uploaded_at?: string
  created_at: string
}

// ============================================
// META AD COPY TYPES
// ============================================

export type CTAType =
  | 'SEND_MESSAGE'
  | 'SEND_WHATSAPP_MESSAGE'
  | 'LEARN_MORE'
  | 'BOOK_NOW'
  | 'CONTACT_US'
  | 'GET_QUOTE'
  | 'SHOP_NOW'

export interface MetaAdCopy {
  id: number
  package_id: number
  tc_package_id: number
  variant: number
  headline: string
  primary_text: string
  description?: string
  cta_type: CTAType
  wa_message_template: string
  generated_by: 'ai' | 'manual'
  approved: boolean
  approved_at?: string
  created_at: string
}

export interface AdCopyVariant {
  variant: number
  headline: string
  primary_text: string
  description: string
  wa_message_template: string
}

export interface GeneratedCopyResponse {
  variants: AdCopyVariant[]
}

// ============================================
// META AD TYPES
// ============================================

export interface MetaAd {
  id: number
  package_id: number
  tc_package_id: number
  variant: number
  meta_ad_id?: string
  meta_adset_id: string
  meta_creative_id?: string
  ad_name: string
  status: MetaAdStatus
  copy_id?: number
  creative_id?: number
  created_at: string
  published_at?: string
}

export interface MetaAdWithDetails extends MetaAd {
  copy?: MetaAdCopy
  creative?: MetaCreative
  adset?: MetaAdSet
}

// ============================================
// META INSIGHTS TYPES
// ============================================

export interface MetaAdInsight {
  id: number
  meta_ad_id: string
  date_start: string
  date_stop: string
  // Core metrics
  impressions: number
  reach: number
  frequency?: number
  spend: number
  // Click metrics
  clicks: number
  link_clicks: number
  unique_clicks?: number
  cpc?: number
  cpm?: number
  ctr?: number
  unique_ctr?: number
  cost_per_unique_click?: number
  inline_link_clicks?: number
  inline_link_click_ctr?: number
  outbound_clicks?: number
  cost_per_outbound_click?: number
  // Conversion metrics (from actions)
  leads: number
  messages: number
  messaging_first_reply: number
  messaging_conversations_started?: number
  messaging_replies?: number
  cost_per_messaging_reply?: number
  cpl?: number
  conversions?: number
  conversion_values?: number
  cost_per_conversion?: number
  purchase?: number
  purchase_value?: number
  add_to_cart?: number
  initiate_checkout?: number
  // Video metrics
  video_p25_watched?: number
  video_p50_watched?: number
  video_p75_watched?: number
  video_p100_watched?: number
  video_avg_time_watched?: number
  video_plays?: number
  thruplays?: number
  cost_per_thruplay?: number
  // Quality metrics
  quality_ranking?: string
  engagement_rate_ranking?: string
  conversion_rate_ranking?: string
  // Social metrics
  social_spend?: number
  post_engagement?: number
  page_engagement?: number
  post_reactions?: number
  post_comments?: number
  post_shares?: number
  post_saves?: number
  photo_views?: number
  // Result metrics
  results?: number
  result_type?: string
  cost_per_result?: number
  // Raw data for AI
  actions_raw?: Array<{ action_type: string; value: string }>
  cost_per_action_raw?: Array<{ action_type: string; value: string }>
  // Metadata
  synced_at: string
  // UI enrichment (from lookup)
  ad_name?: string
  ad_status?: string
  campaign_id?: string
  campaign_name?: string
  campaign_status?: string
  adset_id?: string
  adset_name?: string
}

export interface InsightsSummary {
  total_spend: number
  total_impressions: number
  total_reach: number
  total_clicks: number
  total_leads: number
  total_messages: number
  avg_cpm: number
  avg_cpc: number
  avg_cpl: number
  avg_ctr: number
}

export type DatePreset = 'today' | 'yesterday' | 'last_7d' | 'last_14d' | 'last_30d' | 'this_month' | 'last_month'

// ============================================
// AI RECOMMENDATION TYPES
// ============================================

export type RecommendationType = 'action' | 'insight' | 'warning'
export type RecommendationPriority = 'high' | 'medium' | 'low'
export type AnalysisType = 'daily' | 'weekly' | 'campaign' | 'package' | 'global'

export interface AIRecommendation {
  type: RecommendationType
  priority: RecommendationPriority
  title: string
  description: string
  action?: string
  affected_ads?: string[]
  suggested_action?: string
}

export interface MetaAIRecommendationRecord {
  id: number
  analysis_date: string
  analysis_type: AnalysisType
  reference_id?: string
  summary: string
  recommendations: AIRecommendation[]
  metrics_analyzed: Record<string, unknown>
  model_used: string
  created_at: string
}

export interface AIAnalysisResponse {
  summary: string
  top_performers: Array<{
    ad_id: string
    ad_name: string
    metrics: Record<string, number>
    reason: string
  }>
  underperformers: Array<{
    ad_id: string
    ad_name: string
    metrics: Record<string, number>
    issue: string
  }>
  recommendations: AIRecommendation[]
  trends: string[]
}

// ============================================
// API REQUEST/RESPONSE TYPES
// ============================================

export interface SyncCampaignsResponse {
  campaigns: MetaCampaignWithAdSets[]
  synced_at: string
}

export interface UploadCreativesRequest {
  packageIds: number[]
  variants?: number[]
}

export interface UploadCreativesProgress {
  type: 'progress' | 'complete' | 'error'
  data: {
    package_id?: number
    variant?: number
    aspect_ratio?: AspectRatio
    status?: string
    meta_hash?: string
    error?: string
    uploaded?: number
    errors?: number
  }
}

export interface GenerateCopyRequest {
  packageIds: number[]
}

export interface GenerateCopyResult {
  package_id: number
  variants: AdCopyVariant[]
  status: 'success' | 'error'
  error?: string
}

export interface GenerateCopyResponse {
  success: boolean
  results: GenerateCopyResult[]
}

export interface CreateAdsRequest {
  packages: Array<{
    package_id: number
    meta_adset_id: string
    variants: number[]
  }>
}

export interface CreateAdsProgress {
  type: 'creating' | 'created' | 'error' | 'complete'
  data: {
    package_id?: number
    variant?: number
    step?: string
    meta_ad_id?: string
    error?: string
    created?: number
    errors?: number
  }
}

export interface SyncInsightsRequest {
  date_preset?: DatePreset
  meta_ad_ids?: string[]
}

export interface SyncInsightsResponse {
  synced: number
  errors: number
}

export interface AnalyzeInsightsRequest {
  analysis_type: AnalysisType
  reference_id?: string
  date_range?: {
    start: string
    end: string
  }
}

// ============================================
// META API RAW RESPONSE TYPES
// ============================================

export interface MetaAPICampaign {
  id: string
  name: string
  status: string
  objective?: string
  daily_budget?: string
  lifetime_budget?: string
  account_currency?: string
}

export interface MetaAPIAdSet {
  id: string
  campaign_id: string
  name: string
  status: string
  targeting?: Record<string, unknown>
  daily_budget?: string
  bid_amount?: string
  optimization_goal?: string
}

export interface MetaAPIAdCreativeParams {
  name: string
  object_story_spec: {
    page_id: string
    link_data?: {
      link: string
      message: string
      name: string
      description?: string
      image_hash?: string
      video_id?: string
      call_to_action: {
        type: string
        value: {
          link?: string
          whatsapp_number?: string
        }
      }
    }
  }
}

export interface MetaAPIAdParams {
  name: string
  adset_id: string
  creative: {
    creative_id: string
  }
  status: string
}

export interface MetaAPIInsight {
  ad_id: string
  date_start: string
  date_stop: string
  // Core metrics
  impressions?: string
  reach?: string
  frequency?: string
  spend?: string
  // Click metrics
  clicks?: string
  unique_clicks?: string
  cpc?: string
  cpm?: string
  ctr?: string
  unique_ctr?: string
  cost_per_unique_click?: string
  inline_link_clicks?: string
  inline_link_click_ctr?: string
  outbound_clicks?: Array<{ action_type: string; value: string }>
  // Video metrics
  video_p25_watched_actions?: Array<{ action_type: string; value: string }>
  video_p50_watched_actions?: Array<{ action_type: string; value: string }>
  video_p75_watched_actions?: Array<{ action_type: string; value: string }>
  video_p100_watched_actions?: Array<{ action_type: string; value: string }>
  video_avg_time_watched_actions?: Array<{ action_type: string; value: string }>
  video_play_actions?: Array<{ action_type: string; value: string }>
  // Quality ranking
  quality_ranking?: string
  engagement_rate_ranking?: string
  conversion_rate_ranking?: string
  // Actions and costs
  actions?: Array<{
    action_type: string
    value: string
  }>
  cost_per_action_type?: Array<{
    action_type: string
    value: string
  }>
  conversions?: string
  conversion_values?: string
  cost_per_conversion?: string
  // Social
  social_spend?: string
}

// ============================================
// PACKAGE DATA FOR COPY GENERATION
// ============================================

export interface PackageDataForCopy {
  id: number
  tc_package_id: number
  title: string
  large_title?: string
  destinations: string
  price: number
  currency: string
  nights: number
  adults: number
  departure_date?: string
  airline?: string
  hotel_name?: string
  hotel_category?: string
  includes?: string
  themes?: string[]
}

// ============================================
// MARKETING STATUS
// ============================================

export type MarketingStatus =
  | 'pending'           // Waiting for copy/creative
  | 'copy_generated'    // Copy generated, pending approval
  | 'ready'            // Ready to create ads
  | 'creating'         // Ads being created
  | 'active'           // Ads live
  | 'paused'           // Ads paused
  | 'completed'        // Campaign ended

export interface PackageMarketingStatus {
  package_id: number
  tc_package_id: number
  marketing_status: MarketingStatus
  copies_count: number
  creatives_count: number
  ads_created_count: number
  ads_active_count: number
  total_spend: number
  total_leads: number
}
