import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CompaniesService } from './companies.service';
import { Public } from '../auth/auth.guard';

@ApiTags('companies')
@ApiBearerAuth()
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  /**
   * GET /companies/search?q=...
   * Search companies by name or ICO.
   */
  @Get('search')
  @Public()
  @ApiOperation({ summary: 'Search companies' })
  async search(
    @Query('q') q: string,
    @Query('page') page?: string,
  ) {
    const pageNumber = page ? parseInt(page, 10) : 1;
    return this.companiesService.search(q, isNaN(pageNumber) ? 1 : pageNumber);
  }

  /**
   * GET /companies/browse
   * Browsing all companies from FinStat database with filters/sorting
   */
  @Get('browse')
  @Public()
  @ApiOperation({ summary: 'Browse company database with filters and sorting' })
  async browse(
    @Query('page') page?: string,
    @Query('sort') sort?: string,
    @Query('activity') activity?: string,
    @Query('region') region?: string,
    @Query('legalForm') legalForm?: string,
    @Query('employees') employees?: string,
    @Query('salesFrom') salesFrom?: string,
    @Query('q') q?: string,
  ) {
    const pageNumber = page ? parseInt(page, 10) : 1;
    return this.companiesService.browseFinStatDatabase({
      page: isNaN(pageNumber) ? 1 : pageNumber,
      sort: sort || 'sales-desc',
      activity: activity || '',
      region: region || '',
      legalForm: legalForm || '',
      employees: employees || '',
      salesFrom: salesFrom || '',
      query: q || '',
    });
  }

  /**
   * GET /companies/:ico
   * Returns a company risk profile by ICO.
   */
  @Get(':ico')
  @Public()
  @ApiOperation({ summary: 'Get company data by ICO' })
  async getCompany(@Param('ico') ico: string) {
    return this.companiesService.getCompany(ico);
  }

  /**
   * GET /companies/:ico/history
   * Company risk-score change history.
   */
  @Get(':ico/history')
  @Public()
  @ApiOperation({ summary: 'Company change history' })
  async getHistory(@Param('ico') ico: string) {
    return this.companiesService.getHistory(ico);
  }

  /**
   * GET /companies/:ico/refresh
   * Forces a data refresh (bypasses cache).
   */
  @Get(':ico/refresh')
  @ApiOperation({ summary: 'Force data refresh from source APIs' })
  async refreshCompany(@Param('ico') ico: string) {
    return this.companiesService.fetchAndStore(ico.padStart(8, '0'));
  }
}
