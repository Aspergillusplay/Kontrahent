import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Param,
  Body,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, Length, Matches } from 'class-validator';
import { WatchlistService } from './watchlist.service';

class AddToWatchlistDto {
  @IsString()
  @Length(6, 8)
  @Matches(/^\d+$/)
  ico: string;

  @IsOptional()
  @IsString()
  alias?: string;
}

class UpdateWatchlistDto {
  @IsOptional()
  @IsString()
  alias?: string;

  @IsOptional()
  @IsBoolean()
  notify_telegram?: boolean;

  @IsOptional()
  @IsBoolean()
  notify_push?: boolean;
}

@ApiTags('watchlist')
@ApiBearerAuth()
@Controller('watchlist')
export class WatchlistController {
  constructor(private readonly watchlistService: WatchlistService) {}

  @Get()
  @ApiOperation({ summary: 'My watched companies' })
  getWatchlist(@Request() req) {
    return this.watchlistService.getWatchlist(req.user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Add company to watchlist' })
  addToWatchlist(@Request() req, @Body() dto: AddToWatchlistDto) {
    return this.watchlistService.addToWatchlist(req.user.id, dto.ico, dto.alias);
  }

  @Patch(':ico')
  @ApiOperation({ summary: 'Update watched company settings' })
  updateItem(
    @Request() req,
    @Param('ico') ico: string,
    @Body() dto: UpdateWatchlistDto,
  ) {
    return this.watchlistService.updateWatchlistItem(req.user.id, ico, dto);
  }

  @Delete(':ico')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove company from watchlist' })
  removeFromWatchlist(@Request() req, @Param('ico') ico: string) {
    return this.watchlistService.removeFromWatchlist(req.user.id, ico);
  }
}
