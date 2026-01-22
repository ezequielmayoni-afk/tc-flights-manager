import { getToken } from './auth'
import type {
  TCTransport,
  TCModality,
  TCTransportResponse,
  TCSyncResult,
  TCBookingResponse,
  TCPackageListResponse,
  TCPackageDetailResponse,
  TCPackageInfoResponse,
  TCTransportListResponse,
  TCTransportWithModalities
} from './types'

const TC_API_BASE_URL = process.env.TC_API_BASE_URL || 'https://online.travelcompositor.com/resources'
const TC_SUPPLIER_ID = process.env.TC_SUPPLIER_ID || ''
const TC_MICROSITE_ID = process.env.TC_MICROSITE_ID || 'siviajo'

/**
 * TravelCompositor API Client
 */
class TCClient {
  private baseUrl: string
  private supplierId: string

  constructor() {
    this.baseUrl = TC_API_BASE_URL
    this.supplierId = TC_SUPPLIER_ID
  }

  /**
   * Make an authenticated request to TC API
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    context?: { action?: string; tc_transport_id?: string; flight_id?: number }
  ): Promise<T> {
    const token = await getToken()
    const url = `${this.baseUrl}${endpoint}`

    // Log context for debugging/tracing if provided
    if (context?.action) {
      console.log(`[TC API] ${context.action}`, context)
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'auth-token': token,
        ...options.headers,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      let errorData: Record<string, unknown> | null = null
      try {
        errorData = JSON.parse(errorText)
      } catch {
        // Not JSON
      }

      // Log error to console (detailed logging happens in sync route)
      console.error(`[TC API Error] ${response.status}:`, errorData || errorText)

      throw new Error(`TC API Error: ${response.status} - ${errorText}`)
    }

    return response.json()
  }

  /**
   * List all transports from TravelCompositor
   * @param options - Query options for filtering/pagination
   */
  async listTransports(options: {
    first?: number
    limit?: number
    active?: boolean
  } = {}): Promise<TCTransportListResponse> {
    const params = new URLSearchParams()

    if (options.first !== undefined) params.set('first', options.first.toString())
    if (options.limit !== undefined) params.set('limit', options.limit.toString())
    if (options.active !== undefined) params.set('active', options.active.toString())

    const queryString = params.toString()
    const endpoint = `/transport/${this.supplierId}${queryString ? `?${queryString}` : ''}`

    console.log(`[TC] Listing transports: ${endpoint}`)

    // TC API may return different structures
    const result = await this.request<unknown>(endpoint, { method: 'GET' })

    console.log(`[TC] Raw response type: ${typeof result}`)
    console.log(`[TC] Raw response:`, JSON.stringify(result, null, 2).substring(0, 1000))

    // Handle array response (list of transports directly)
    if (Array.isArray(result)) {
      console.log(`[TC] Response is array with ${result.length} items`)
      return {
        transports: result as TCTransportWithModalities[],
        pagination: {
          first: options.first || 0,
          limit: options.limit || result.length,
          total: result.length
        }
      }
    }

    // Handle object response with transport/transports key
    if (result && typeof result === 'object') {
      const obj = result as Record<string, unknown>

      // Check for 'transport' key (singular)
      if ('transport' in obj && Array.isArray(obj.transport)) {
        console.log(`[TC] Response has 'transport' array with ${(obj.transport as unknown[]).length} items`)
        return {
          transports: obj.transport as TCTransportWithModalities[],
          pagination: obj.pagination as TCTransportListResponse['pagination'] || {
            first: options.first || 0,
            limit: options.limit || (obj.transport as unknown[]).length,
            total: (obj.transport as unknown[]).length
          }
        }
      }

      // Check for 'transports' key (plural)
      if ('transports' in obj && Array.isArray(obj.transports)) {
        console.log(`[TC] Response has 'transports' array with ${(obj.transports as unknown[]).length} items`)
        return {
          transports: obj.transports as TCTransportWithModalities[],
          pagination: obj.pagination as TCTransportListResponse['pagination']
        }
      }

      // Maybe the response is a single transport object
      if ('id' in obj && 'baseId' in obj) {
        console.log(`[TC] Response is a single transport object`)
        return {
          transports: [obj as unknown as TCTransportWithModalities],
          pagination: { first: 0, limit: 1, total: 1 }
        }
      }
    }

    // Unknown structure - return empty
    console.error(`[TC] Unknown response structure:`, result)
    return {
      transports: [],
      pagination: { first: 0, limit: 0, total: 0 }
    }
  }

  /**
   * Get all transports with pagination handling
   */
  async getAllTransports(options: { active?: boolean } = {}): Promise<TCTransportWithModalities[]> {
    const allTransports: TCTransportWithModalities[] = []
    let first = 0
    const limit = 50

    while (true) {
      const response = await this.listTransports({ first, limit, active: options.active })

      // Safety check for transports array
      if (!response.transports || !Array.isArray(response.transports)) {
        console.log(`[TC] No transports in response, breaking`)
        break
      }

      allTransports.push(...response.transports)

      console.log(`[TC] Fetched ${response.transports.length} transports (total: ${allTransports.length})`)

      // Check if we have more pages
      if (!response.pagination || response.transports.length === 0 || allTransports.length >= response.pagination.total) {
        break
      }
      first += limit
    }

    return allTransports
  }

  /**
   * Get a single transport by ID
   */
  async getTransport(transportId: string): Promise<TCTransportWithModalities> {
    console.log(`[TC] Fetching transport: ${transportId}`)
    return this.request<TCTransportWithModalities>(
      `/transport/${this.supplierId}/${transportId}`,
      { method: 'GET' }
    )
  }

  /**
   * Create a new transport (flight) in TravelCompositor
   * @param transport - Transport data to create
   * @param supplierId - Supplier ID to use in URL (defaults to TC_SUPPLIER_ID env var)
   */
  async createTransport(transport: TCTransport, supplierId?: number): Promise<TCTransportResponse> {
    const supplierIdToUse = supplierId || this.supplierId
    return this.request<TCTransportResponse>(`/transport/${supplierIdToUse}`, {
      method: 'POST',
      body: JSON.stringify(transport),
    })
  }

  /**
   * Update an existing transport (flight) in TravelCompositor
   * @param transport - Transport data to update (must include id)
   * @param supplierId - Supplier ID to use in URL (defaults to TC_SUPPLIER_ID env var)
   */
  async updateTransport(transport: TCTransport, supplierId?: number): Promise<TCTransportResponse> {
    if (!transport.id) {
      throw new Error('Transport ID is required for update')
    }

    const supplierIdToUse = supplierId || this.supplierId
    return this.request<TCTransportResponse>(`/transport/${supplierIdToUse}`, {
      method: 'PUT',
      body: JSON.stringify(transport),
    })
  }

  /**
   * Create a modality for an existing transport
   * @param supplierId - Supplier ID to use in URL (defaults to TC_SUPPLIER_ID env var)
   */
  async createModality(transportId: string, modality: TCModality, supplierId?: number): Promise<void> {
    const supplierIdToUse = supplierId || this.supplierId
    await this.request(`/transport/${supplierIdToUse}/${transportId}`, {
      method: 'POST',
      body: JSON.stringify(modality),
    })
  }

  /**
   * Update an existing modality for a transport
   * @param supplierId - Supplier ID to use in URL (defaults to TC_SUPPLIER_ID env var)
   */
  async updateModality(transportId: string, modality: TCModality, supplierId?: number): Promise<void> {
    const supplierIdToUse = supplierId || this.supplierId
    await this.request(`/transport/${supplierIdToUse}/${transportId}`, {
      method: 'PUT',
      body: JSON.stringify(modality),
    })
  }

  /**
   * Sync a flight to TravelCompositor (create or update)
   * @param transport - Transport data to sync
   * @param supplierId - Supplier ID to use in URL (defaults to TC_SUPPLIER_ID env var)
   */
  async syncTransport(transport: TCTransport, supplierId?: number): Promise<TCSyncResult> {
    try {
      let result: TCTransportResponse

      if (transport.id) {
        // Update existing transport
        result = await this.updateTransport(transport, supplierId)
      } else {
        // Create new transport
        result = await this.createTransport(transport, supplierId)
      }

      // Success logging happens in sync route
      console.log(`[TC] Transport ${transport.id ? 'updated' : 'created'}: ${result.id} (supplier: ${supplierId || this.supplierId})`)

      return {
        success: true,
        transportId: result.id,
      }
    } catch (error) {
      // Error already logged in request method
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error,
      }
    }
  }

  /**
   * Sync a modality to TravelCompositor (create or update)
   * @param isUpdate - if true, tries PUT first; if it fails with "does not exist", falls back to POST
   * @param supplierId - Supplier ID to use in URL (defaults to TC_SUPPLIER_ID env var)
   */
  async syncModality(transportId: string, modality: TCModality, isUpdate: boolean = false, supplierId?: number): Promise<TCSyncResult> {
    try {
      if (isUpdate) {
        try {
          await this.updateModality(transportId, modality, supplierId)
        } catch (updateError) {
          // If update fails because modality doesn't exist, try creating it
          const errorMessage = updateError instanceof Error ? updateError.message : ''
          if (errorMessage.includes('does not exist') || errorMessage.includes('use the create operation')) {
            console.log(`[TC Client] Modality update failed (doesn't exist), falling back to create for transport: ${transportId}`)
            await this.createModality(transportId, modality, supplierId)
          } else {
            throw updateError
          }
        }
      } else {
        try {
          await this.createModality(transportId, modality, supplierId)
        } catch (createError) {
          // If create fails because modality already exists, try updating it
          const errorMessage = createError instanceof Error ? createError.message : ''
          if (errorMessage.includes('already exists') || errorMessage.includes('use the update operation')) {
            console.log(`[TC Client] Modality create failed (already exists), falling back to update for transport: ${transportId}`)
            await this.updateModality(transportId, modality, supplierId)
          } else {
            throw createError
          }
        }
      }

      return {
        success: true,
        transportId,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error,
      }
    }
  }

  /**
   * Get booking details from TravelCompositor
   * Called after receiving a webhook notification to get full reservation details
   */
  async getBooking(bookingReference: string): Promise<TCBookingResponse | null> {
    try {
      const micrositeId = process.env.TC_MICROSITE_ID || 'siviajo'
      console.log(`[TC] Fetching booking: ${bookingReference}`)
      const result = await this.request<TCBookingResponse>(
        `/booking/getBookings/${micrositeId}/${bookingReference}`,
        { method: 'GET' }
      )
      console.log(`[TC] Booking fetched successfully: ${bookingReference}`)
      return result
    } catch (error) {
      console.error(`[TC] Failed to fetch booking ${bookingReference}:`, error)
      return null
    }
  }

  /**
   * Delete (deactivate) a transport from TravelCompositor
   * TC API doesn't support DELETE, so we set active=false instead
   * @param supplierId - Supplier ID to use in URL (defaults to TC_SUPPLIER_ID env var)
   */
  async deleteTransport(transportId: string, supplierId?: number): Promise<TCSyncResult> {
    try {
      const supplierIdToUse = supplierId || this.supplierId
      // TC doesn't have a DELETE endpoint - we deactivate by setting active=false
      await this.request<TCTransportResponse>(
        `/transport/${supplierIdToUse}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            id: transportId,
            active: false,
          }),
        },
        { action: 'deactivate-transport', tc_transport_id: transportId }
      )

      // Success logging happens in sync route
      console.log(`[TC] Transport deactivated: ${transportId} (supplier: ${supplierIdToUse})`)

      return {
        success: true,
        transportId,
      }
    } catch (error) {
      // Error already logged in request method
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error,
      }
    }
  }

  // ============================================
  // PACKAGE METHODS
  // ============================================

  /**
   * List packages from TravelCompositor
   * @param options - Query options for filtering packages
   */
  async listPackages(options: {
    username?: string
    first?: number
    limit?: number
    onlyVisible?: boolean
  } = {}): Promise<TCPackageListResponse> {
    const params = new URLSearchParams()

    if (options.username) params.set('username', options.username)
    if (options.first !== undefined) params.set('first', options.first.toString())
    if (options.limit !== undefined) params.set('limit', options.limit.toString())
    if (options.onlyVisible !== undefined) params.set('onlyVisible', options.onlyVisible.toString())

    const queryString = params.toString()
    const endpoint = `/package/${TC_MICROSITE_ID}${queryString ? `?${queryString}` : ''}`

    console.log(`[TC] Listing packages: ${endpoint}`)
    return this.request<TCPackageListResponse>(endpoint, { method: 'GET' })
  }

  /**
   * Get all packages for a specific user (handles pagination)
   * @param username - The username to filter packages by
   * @param options - Additional options like onlyVisible
   */
  async getAllPackagesByUser(username: string, options: { onlyVisible?: boolean } = {}): Promise<TCPackageListResponse['package']> {
    const allPackages: TCPackageListResponse['package'] = []
    let first = 0
    const limit = 50

    while (true) {
      const response = await this.listPackages({ username, first, limit, onlyVisible: options.onlyVisible })
      allPackages.push(...response.package)

      console.log(`[TC] Fetched ${response.package.length} packages (total: ${allPackages.length}/${response.pagination.totalResults})`)

      if (allPackages.length >= response.pagination.totalResults) {
        break
      }
      first += limit
    }

    return allPackages
  }

  /**
   * Get all packages excluding specific users (handles pagination)
   * @param excludeUsers - Array of usernames to exclude
   * @param options - Additional options like onlyVisible
   */
  async getAllPackagesExcludingUsers(excludeUsers: string[], options: { onlyVisible?: boolean } = {}): Promise<TCPackageListResponse['package']> {
    const allPackages: TCPackageListResponse['package'] = []
    let first = 0
    const limit = 50

    while (true) {
      const response = await this.listPackages({ first, limit, onlyVisible: options.onlyVisible })

      // Filter out excluded users
      const filteredPackages = response.package.filter(pkg => !excludeUsers.includes(pkg.user))
      allPackages.push(...filteredPackages)

      console.log(`[TC] Fetched ${response.package.length} packages, kept ${filteredPackages.length} after exclusion (total: ${allPackages.length}/${response.pagination.totalResults})`)

      if (first + response.package.length >= response.pagination.totalResults) {
        break
      }
      first += limit
    }

    return allPackages
  }

  /**
   * Get package details from TravelCompositor
   * @param packageId - The TC package ID
   */
  async getPackageDetail(packageId: number): Promise<TCPackageDetailResponse> {
    console.log(`[TC] Fetching package detail: ${packageId}`)
    return this.request<TCPackageDetailResponse>(
      `/package/${TC_MICROSITE_ID}/${packageId}`,
      { method: 'GET' }
    )
  }

  /**
   * Get package info (includes dateSettings with availRange)
   * @param packageId - The TC package ID
   */
  async getPackageInfo(packageId: number): Promise<TCPackageInfoResponse> {
    console.log(`[TC] Fetching package info: ${packageId}`)
    return this.request<TCPackageInfoResponse>(
      `/package/${TC_MICROSITE_ID}/info/${packageId}`,
      { method: 'GET' }
    )
  }

  /**
   * Deactivate (hide) a package in TravelCompositor
   * Sets active=false to hide it from the microsite
   * @param packageId - The TC package ID
   */
  async deactivatePackage(packageId: number): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`[TC] Deactivating package: ${packageId}`)
      await this.request(
        `/package/${TC_MICROSITE_ID}/${packageId}`,
        {
          method: 'PUT',
          body: JSON.stringify({ active: false }),
        }
      )
      console.log(`[TC] Package deactivated: ${packageId}`)
      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error(`[TC] Failed to deactivate package ${packageId}:`, errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  /**
   * Update a package's date range (availRange) in TravelCompositor
   * @param packageId - The TC package ID
   * @param startDate - Start date in YYYY-MM-DD format
   * @param endDate - End date in YYYY-MM-DD format
   */
  async updatePackageDateRange(
    packageId: number,
    startDate: string,
    endDate: string
  ): Promise<{ success: boolean; error?: string; response?: unknown }> {
    try {
      console.log(`[TC] Updating package ${packageId} date range: ${startDate} to ${endDate}`)
      const response = await this.request<unknown>(
        `/package/${TC_MICROSITE_ID}/${packageId}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            dateSettings: {
              availRange: {
                start: startDate,
                end: endDate,
              },
            },
          }),
        }
      )
      console.log(`[TC] Package date range updated: ${packageId}`)
      return { success: true, response }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error(`[TC] Failed to update package ${packageId} date range:`, errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  // ============================================
  // SUPPLIER METHODS
  // ============================================

  /**
   * List suppliers from TravelCompositor
   * Uses GET /suppliers endpoint which returns suppliers of the operator
   */
  async listSuppliers(): Promise<{ id: number; name: string }[]> {
    console.log(`[TC] Fetching suppliers`)
    const result = await this.request<{ id: number; commercialName: string; active: boolean }[]>(
      `/suppliers`,
      { method: 'GET' }
    )
    // Map commercialName to name and filter only active suppliers
    return (result || [])
      .filter(s => s.active)
      .map(s => ({ id: s.id, name: s.commercialName }))
  }
}

// Singleton instance
export const tcClient = new TCClient()

// Export utility functions for easier use
export const listTransports = (options?: Parameters<typeof tcClient.listTransports>[0]) =>
  tcClient.listTransports(options)
export const getAllTransports = (options?: { active?: boolean }) =>
  tcClient.getAllTransports(options)
export const getTransport = (transportId: string) => tcClient.getTransport(transportId)
export const createTransport = (transport: TCTransport, supplierId?: number) =>
  tcClient.createTransport(transport, supplierId)
export const updateTransport = (transport: TCTransport, supplierId?: number) =>
  tcClient.updateTransport(transport, supplierId)
export const createModality = (transportId: string, modality: TCModality, supplierId?: number) =>
  tcClient.createModality(transportId, modality, supplierId)
export const syncTransport = (transport: TCTransport, supplierId?: number) =>
  tcClient.syncTransport(transport, supplierId)
export const syncModality = (transportId: string, modality: TCModality, isUpdate: boolean = false, supplierId?: number) =>
  tcClient.syncModality(transportId, modality, isUpdate, supplierId)
export const deleteTransport = (transportId: string, supplierId?: number) =>
  tcClient.deleteTransport(transportId, supplierId)
export const getBooking = (bookingReference: string) => tcClient.getBooking(bookingReference)

// Package exports
export const listPackages = (options?: Parameters<typeof tcClient.listPackages>[0]) =>
  tcClient.listPackages(options)
export const getAllPackagesByUser = (username: string, options?: { onlyVisible?: boolean }) => tcClient.getAllPackagesByUser(username, options)
export const getAllPackagesExcludingUsers = (excludeUsers: string[], options?: { onlyVisible?: boolean }) => tcClient.getAllPackagesExcludingUsers(excludeUsers, options)
export const getPackageDetail = (packageId: number) => tcClient.getPackageDetail(packageId)
export const getPackageInfo = (packageId: number) => tcClient.getPackageInfo(packageId)
export const deactivatePackage = (packageId: number) => tcClient.deactivatePackage(packageId)
export const updatePackageDateRange = (packageId: number, startDate: string, endDate: string) =>
  tcClient.updatePackageDateRange(packageId, startDate, endDate)

// Supplier exports
export const listSuppliers = () => tcClient.listSuppliers()

/**
 * Validate price against TC transport prices
 * Returns validation result with details
 */
export async function validateTransportPrice(
  transportId: string,
  adults: number,
  children: number,
  infants: number,
  totalAmount: number,
  isRoundTrip: boolean = false,
  tolerancePercent: number = 10
): Promise<{
  isValid: boolean
  expectedPrice: number
  actualPrice: number
  difference: number
  percentDiff: number
  transportFound: boolean
}> {
  try {
    const transport = await getTransport(transportId)
    if (!transport) {
      return {
        isValid: false,
        expectedPrice: 0,
        actualPrice: totalAmount,
        difference: totalAmount,
        percentDiff: 100,
        transportFound: false,
      }
    }

    // Calculate expected price based on TC transport prices
    let expectedPrice = 0

    if (isRoundTrip) {
      // Round trip prices
      const adultPrice = (transport.baseAdultRTPrice || 0) + (transport.adultRTTaxesAmount || 0)
      const childPrice = (transport.baseChildrenRTPrice || 0) + (transport.childrenRTTaxesAmount || 0)
      const infantPrice = (transport.baseInfantRTPrice || 0) + (transport.infantRTTaxesAmount || 0)
      expectedPrice = (adults * adultPrice) + (children * childPrice) + (infants * infantPrice)
    } else {
      // One way prices
      const adultPrice = (transport.baseAdultPrice || 0) + (transport.adultTaxesAmount || 0)
      const childPrice = (transport.baseChildrenPrice || 0) + (transport.childrenTaxesAmount || 0)
      const infantPrice = (transport.baseInfantPrice || 0) + (transport.infantTaxesAmount || 0)
      expectedPrice = (adults * adultPrice) + (children * childPrice) + (infants * infantPrice)
    }

    const difference = Math.abs(totalAmount - expectedPrice)
    const percentDiff = expectedPrice > 0 ? (difference / expectedPrice) * 100 : (totalAmount > 0 ? 100 : 0)
    const isValid = percentDiff <= tolerancePercent

    console.log(`[TC Price Validation] Transport ${transportId}: expected=${expectedPrice}, actual=${totalAmount}, diff=${percentDiff.toFixed(2)}%`)

    return {
      isValid,
      expectedPrice,
      actualPrice: totalAmount,
      difference,
      percentDiff,
      transportFound: true,
    }
  } catch (error) {
    console.error(`[TC Price Validation] Error fetching transport ${transportId}:`, error)
    // If we can't validate, consider it valid to not block the operation
    // but log for monitoring
    return {
      isValid: true,
      expectedPrice: 0,
      actualPrice: totalAmount,
      difference: 0,
      percentDiff: 0,
      transportFound: false,
    }
  }
}
