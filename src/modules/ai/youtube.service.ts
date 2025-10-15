import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';

export interface YouTubeVideoResult {
  title: string;
  url: string;
  description: string;
  duration: string;
  tag: string;
  channelName: string;
  publishedAt: string;
  thumbnail: string;
  verified: boolean;
}

export interface SearchParams {
  query: string;
  ageRange: string;
  subject: string;
  maxResults?: number;
}

@Injectable()
export class YouTubeService {
  private readonly logger = new Logger(YouTubeService.name);
  private youtube;
  
  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('YOUTUBE_KEY');
    if (!apiKey) {
      this.logger.error('YouTube API key not found in environment variables');
      return;
    }
    
    this.youtube = google.youtube({
      version: 'v3',
      auth: apiKey
    });
    
    this.logger.log('YouTube service initialized successfully');
  }

  /**
   * Search for educational videos using YouTube Data API
   */
  async searchEducationalVideos(params: SearchParams): Promise<YouTubeVideoResult[]> {
    if (!this.youtube) {
      this.logger.error('YouTube service not initialized');
      return this.getFallbackVideos(params.subject);
    }

    const searchQuery = this.buildEducationalQuery(params);
    this.logger.log(`Searching YouTube for: "${searchQuery}"`);
    
    try {
      const response = await this.youtube.search.list({
        part: ['snippet'],
        q: searchQuery,
        type: 'video',
        videoDefinition: 'high',
        videoCaption: 'closedCaption', // Prefer videos with captions
        maxResults: params.maxResults || 10,
        order: 'relevance',
        videoSyndicated: 'true', // Only embeddable videos
        videoEmbeddable: 'true',
        regionCode: 'US', // Focus on US educational content

        // include African tailored content in the future
        relevanceLanguage: 'en'
      });

      if (!response.data.items || response.data.items.length === 0) {
        this.logger.warn(`No videos found for query: ${searchQuery}`);
        return this.getFallbackVideos(params.subject);
      }

      this.logger.log(`Found ${response.data.items.length} videos from YouTube API`);

      const videos = await Promise.all(
        response.data.items.map(async (item) => {
          try {
            const videoDetails = await this.getVideoDetails(item.id.videoId);
            const isFromTrustedChannel = this.isChannelTrusted(item.snippet.channelId);
            
            return {
              title: this.cleanTitle(item.snippet.title),
              url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
              description: this.cleanDescription(item.snippet.description),
              duration: videoDetails ? this.formatDuration(videoDetails.contentDetails.duration) : 'Unknown',
              tag: this.capitalizeFirst(params.subject),
              channelName: item.snippet.channelTitle,
              publishedAt: item.snippet.publishedAt,
              thumbnail: item.snippet.thumbnails?.medium?.url || '',
              verified: isFromTrustedChannel
            };
          } catch (error) {
            this.logger.error(`Error processing video ${item.id.videoId}: ${error.message}`);
            return null;
          }
        })
      );

      // Filter out null results and prioritize trusted channels
      const validVideos = videos.filter(video => video !== null);
      const trustedVideos = validVideos.filter(video => video.verified);
      const otherVideos = validVideos.filter(video => !video.verified);
      
      // Return trusted videos first, then others if we need more
      const finalVideos = [...trustedVideos, ...otherVideos].slice(0, params.maxResults || 5);
      
      this.logger.log(`Returning ${finalVideos.length} videos (${trustedVideos.length} from trusted channels)`);
      return finalVideos;
      
    } catch (error) {
      this.logger.error(`YouTube API error: ${error.message}`);
      return this.getFallbackVideos(params.subject);
    }
  }

  /**
   * Get detailed information about a specific video
   */
  private async getVideoDetails(videoId: string) {
    try {
      const response = await this.youtube.videos.list({
        part: ['contentDetails', 'statistics'],
        id: [videoId]
      });
      return response.data.items?.[0];
    } catch (error) {
      this.logger.error(`Error getting video details for ${videoId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Build an optimized search query for educational content
   */
  private buildEducationalQuery(params: SearchParams): string {
    const ageTerms = this.getAgeTerms(params.ageRange);
    const subjectTerms = this.getSubjectTerms(params.subject);
    
    // Build query with educational keywords and filters
    const baseQuery = `${subjectTerms} ${ageTerms} educational learning`;
    const qualityFilters = 'tutorial lesson explain kids children';
    
    return `${baseQuery} ${qualityFilters}`.trim();
  }

  /**
   * Get age-appropriate search terms
   */
  private getAgeTerms(ageRange: string): string {
    const age = parseInt(ageRange) || 8;
    
    if (age <= 6) return 'preschool toddler early learning';
    if (age <= 10) return 'kids elementary primary';
    if (age <= 14) return 'middle school junior';
    return 'high school secondary';
  }

  /**
   * Get subject-specific search terms
   */
  private getSubjectTerms(subject: string): string {
    const subjectMap = {
      math: 'mathematics numbers counting arithmetic algebra geometry',
      science: 'biology chemistry physics nature experiments',
      reading: 'literacy phonics vocabulary comprehension stories',
      art: 'drawing painting creative arts crafts',
      history: 'historical events timeline civilization',
      geography: 'countries maps world cultures'
    };
    
    return subjectMap[subject.toLowerCase()] || subject;
  }

  /**
   * Check if a channel is from our trusted educational channels list
   */
  private isChannelTrusted(channelId: string): boolean {
    const trustedChannels = [
      'UC4a-Gbdw7vOaccHmFo40b9g', // Khan Academy Kids
      'UCsooa4yRKGN_zEE8iknghZA', // TED-Ed
      'UCzJQOHztj_KsJEtaJTqhNhg', // SciShow Kids  
      'UCXVCgDuD_QCkI7gTKU7-tpg', // National Geographic Kids
      'UC-JqSDMh0lBPL6L6K16dJKg', // PBS Kids
      'UCAuUUnT6oDeKwE6v1NGQxug', // TED
      'UCdC0An4ZPNr_YiFiYoVbwaw', // Numberphile
      'UC1_uAIS3r8Vu6JjXWvastJg', // Mathologer
      'UCJ0-OtVpF0wOKEqT2Z1HEtA', // ElectroBOOM
      'UCHnyfMqiRRG1u-2MsSQLbXA', // Veritasium
      'UCciQ8wFcVoIIMi-lfu8-cjA', // SmarterEveryDay
      'UC6nSFpj9HTCZ5t-N3Rm3-HA', // Vsauce
      'UCsXVk37bltHxD1rDPwtNM8Q', // Kurzgesagt
      'UC0e3QhIYukixgh5VVpKHH9Q', // Minute Physics
      'UCRRVXdQZl0HJD4v1ljXf4ig', // Professor Dave Explains
      'UClq42foiSgl7sSpLupnugGA', // AsapSCIENCE
      'UC7_gcs09iThXybpVgjHZ_7g', // PBS Digital Studios
    ];
    
    return trustedChannels.includes(channelId);
  }

  /**
   * Format ISO 8601 duration to human readable format
   */
  private formatDuration(isoDuration: string): string {
    if (!isoDuration) return 'Unknown';
    
    const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 'Unknown';
    
    const hours = parseInt(match[1]) || 0;
    const minutes = parseInt(match[2]) || 0;
    const seconds = parseInt(match[3]) || 0;
    
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes} minutes`;
    return `${seconds} seconds`;
  }

  /**
   * Clean and truncate video title
   */
  private cleanTitle(title: string): string {
    // Remove common YouTube spam patterns and truncate
    const cleaned = title
      .replace(/\[.*?\]/g, '') // Remove brackets
      .replace(/\(.*?\)/g, '') // Remove parentheses  
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
    
    return cleaned.length > 80 ? cleaned.substring(0, 77) + '...' : cleaned;
  }

  /**
   * Clean and truncate video description
   */
  private cleanDescription(description: string): string {
    if (!description) return 'Educational video content';
    
    // Take first sentence or first 150 characters
    const firstSentence = description.split('.')[0];
    const cleaned = firstSentence.length > 150 
      ? description.substring(0, 147) + '...'
      : firstSentence + '.';
    
    return cleaned.replace(/\n/g, ' ').trim();
  }

  /**
   * Capitalize first letter of string
   */
  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  /**
   * Fallback videos when API fails
   */
  private getFallbackVideos(subject: string): YouTubeVideoResult[] {
    const fallbackVideos = {
      math: [
        {
          title: "Khan Academy Kids - Basic Math Concepts",
          url: "https://www.youtube.com/channel/UC4a-Gbdw7vOaccHmFo40b9g",
          description: "Learn fundamental math concepts with engaging visual examples",
          duration: "5-10 minutes",
          tag: "Math",
          channelName: "Khan Academy Kids",
          publishedAt: new Date().toISOString(),
          thumbnail: "",
          verified: true
        }
      ],
      science: [
        {
          title: "SciShow Kids - Science Experiments",
          url: "https://www.youtube.com/user/scishowkids", 
          description: "Fun science experiments and explanations for curious kids",
          duration: "4-8 minutes",
          tag: "Science",
          channelName: "SciShow Kids",
          publishedAt: new Date().toISOString(),
          thumbnail: "",
          verified: true
        }
      ],
      reading: [
        {
          title: "PBS Kids - Reading Adventures",
          url: "https://www.youtube.com/user/pbskids",
          description: "Interactive reading activities and phonics lessons",
          duration: "5-12 minutes", 
          tag: "Reading",
          channelName: "PBS Kids",
          publishedAt: new Date().toISOString(),
          thumbnail: "",
          verified: true
        }
      ]
    };

    return fallbackVideos[subject.toLowerCase()] || fallbackVideos.math;
  }
}