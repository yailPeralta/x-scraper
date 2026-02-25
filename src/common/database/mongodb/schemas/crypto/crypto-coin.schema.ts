// src/crypto/schemas/crypto-asset.schema.ts

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';
import { Decimal128 } from 'mongoose'; // careful — many prefer string instead

export type CryptoAssetDocument = HydratedDocument<CryptoAsset>;

export enum ChainType {
  BITCOIN = 'bitcoin',
  ETHEREUM = 'ethereum',
  BINANCE = 'binance-smart-chain',
  SOLANA = 'solana',
  POLYGON = 'polygon',
  ARBITRUM = 'arbitrum',
  OPTIMISM = 'optimism',
  BASE = 'base',
  AVALANCHE = 'avalanche',
  // ... add more
}

export enum AssetType {
  NATIVE = 'native', // BTC, ETH, SOL, BNB, AVAX...
  ERC20 = 'erc20',
  BEP20 = 'bep20',
  SPL = 'spl', // Solana tokens
  OTHER = 'other',
}

@Schema({
  timestamps: true,
  toJSON: { virtuals: true, getters: true },
  toObject: { virtuals: true, getters: true },
})
export class CryptoAsset {
  @Prop({
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    index: true,
  })
  symbol: string; // BTC, ETH, USDT, UNI, SOL...

  @Prop({ required: true, trim: true, index: true })
  name: string; // Bitcoin, Ethereum, Tether USD...

  @Prop({ enum: AssetType, required: true, index: true })
  type: AssetType;

  @Prop({ enum: ChainType, required: true, index: true })
  chain: ChainType;

  // ── Contract & Network specifics ──────────────────────────
  @Prop({ type: String, sparse: true, lowercase: true }) // null/empty for native coins
  contractAddress?: string;

  @Prop({ type: Number, default: 18, min: 0, max: 18 }) // most common range
  decimals: number;

  // ── Supply & circulating data (often updated by cron / oracle) ──
  @Prop({ type: String }) // "21000000" or "1000000007.456"
  totalSupply?: string;

  @Prop({ type: String })
  maxSupply?: string; // many have null (unlimited)

  @Prop({ type: String })
  circulatingSupply?: string;

  // ── Price & market data (updated frequently) ──────────────
  @Prop({ type: String, default: '0' })
  priceUsd?: string; // better as string or Decimal128

  @Prop({ type: Number, default: 0 })
  marketCapUsd?: number;

  @Prop({ type: Number, default: 0 })
  fdvUsd?: number; // fully diluted value

  @Prop({ type: Number, default: 0 })
  volume24hUsd?: number;

  @Prop({ type: Number })
  change24h?: number; // percentage

  // ── Metadata / Display ────────────────────────────────────
  @Prop({ type: String })
  logoUrl?: string; // CDN link or IPFS

  @Prop({ type: String })
  website?: string;

  @Prop({ type: String })
  xProfile?: string;

  @Prop({ type: [String] })
  explorers?: string[]; // etherscan, solscan, etc.

  @Prop({ type: String })
  description?: string;

  @Prop({ type: Boolean, default: false })
  isStablecoin: boolean;

  @Prop({ type: Boolean, default: true })
  isActive: boolean; // show/hide in UI

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'CryptoAsset',
    sparse: true,
  })
  underlyingAsset?: MongooseSchema.Types.ObjectId; // e.g. wrapped BTC → BTC

  @Prop({ type: Date })
  lastMetadataUpdate?: Date;

  @Prop({ type: String })
  dataSource?: string; // coingecko, coinmarketcap, defillama, manual...
}

export const CryptoAssetSchema = SchemaFactory.createForClass(CryptoAsset);

// Useful compound indexes
CryptoAssetSchema.index({ chain: 1, type: 1, symbol: 1 });
CryptoAssetSchema.index(
  { contractAddress: 1, chain: 1 },
  { sparse: true, unique: true },
);
CryptoAssetSchema.index({ isActive: 1, marketCapUsd: -1 }); // for top lists
