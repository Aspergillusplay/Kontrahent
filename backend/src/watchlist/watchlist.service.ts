import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CompaniesService } from '../companies/companies.service';

@Injectable()
export class WatchlistService {
  constructor(
    private supabase: SupabaseService,
    private companies: CompaniesService,
  ) {}

  /** Returns the full user watchlist with current risk data. */
  async getWatchlist(userId: string) {
    const { data, error } = await this.supabase.db
      .from('watchlists')
      .select(`
        id,
        ico,
        alias,
        notify_telegram,
        notify_push,
        created_at,
        companies (
          name, legal_form, city, status,
          risk_score, risk_reasons,
          tax_debt, social_debt, health_debt,
          court_cases, is_bankrupt, is_in_liquidation,
          last_checked_at, raw_data
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  /** Adds a company to watchlist and ensures company data exists in DB. */
  async addToWatchlist(
    userId: string,
    ico: string,
    alias?: string,
  ) {
    const normalized = ico.padStart(8, '0');

    // Ensure company exists in our DB
    await this.companies.getCompany(normalized);

    const { data, error } = await this.supabase.db
      .from('watchlists')
      .insert({
        user_id: userId,
        ico: normalized,
        alias: alias || null,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new ConflictException('This company is already in your watchlist');
      }
      throw error;
    }
    return data;
  }

  /** Updates watchlist item settings. */
  async updateWatchlistItem(
    userId: string,
    ico: string,
    updates: { alias?: string; notify_telegram?: boolean; notify_push?: boolean },
  ) {
    const normalized = ico.padStart(8, '0');
    const { data, error } = await this.supabase.db
      .from('watchlists')
      .update(updates)
      .eq('user_id', userId)
      .eq('ico', normalized)
      .select()
      .single();

    if (error) throw error;
    if (!data) throw new NotFoundException('Company is not in your watchlist');
    return data;
  }

  /** Removes a company from watchlist. */
  async removeFromWatchlist(userId: string, ico: string) {
    const normalized = ico.padStart(8, '0');
    const { error } = await this.supabase.db
      .from('watchlists')
      .delete()
      .eq('user_id', userId)
      .eq('ico', normalized);

    if (error) throw error;
    return { success: true };
  }

  /** Returns all watched ICO + user pairs for monitoring cron jobs. */
  async getAllWatchedIcos(): Promise<{ user_id: string; ico: string; notify_telegram: boolean; notify_push: boolean }[]> {
    const { data, error } = await this.supabase.db
      .from('watchlists')
      .select('user_id, ico, notify_telegram, notify_push');

    if (error) throw error;
    return data || [];
  }
}
