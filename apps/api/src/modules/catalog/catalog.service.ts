import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Model, Types, type Connection } from 'mongoose';
import { Product, SizeGuideRow } from './product.schema.js';
import { Category, ProductVariant } from './catalog.schemas.js';
import type {
  CreateProductDto,
  SizeSuggestionDto,
  UpdateCategoryDto,
  UpdateProductDto,
  UpdateVariantDto,
  VariantDto,
} from './catalog.dto.js';
import type { CategoryDto } from './catalog.dto.js';
import { MediaObject } from '../storage/media-object.schema.js';
import { StorageService } from '../storage/storage.service.js';
import { AuditService } from '../operations/audit.service.js';
import { escapeRegex } from '../../common/escape-regex.js';
import { withCommerceTransaction } from '../../common/mongo-transaction.util.js';

type ListQuery = {
  q?: string;
  category?: string;
  sort?: string;
  page: number;
  limit: number;
  minPrice?: number;
  maxPrice?: number;
  color?: string;
  size?: string;
};

@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);
  constructor(
    @InjectModel(Product.name) private readonly products: Model<Product>,
    @InjectModel(Category.name) private readonly categories: Model<Category>,
    @InjectModel(ProductVariant.name) private readonly variants: Model<ProductVariant>,
    @InjectModel(MediaObject.name) private readonly media: Model<MediaObject>,
    private readonly storage: StorageService,
    @InjectConnection() private readonly connection: Connection,
    private readonly audit: AuditService,
  ) {}

  async listPublished(query: ListQuery) {
    const filter: Record<string, unknown> = { status: 'PUBLISHED' };
    if (query.q?.trim()) {
      filter.$text = { $search: query.q.trim() };
    }
    if (query.category?.trim()) {
      const category = await this.categories.findOne({ slug: query.category.trim().toLowerCase(), status: 'ACTIVE' }).lean().exec();
      if (!category) return { items: [], page: query.page, limit: query.limit, total: 0 };
      filter.categoryId = String(category._id);
    }

    const variantFilter: Record<string, unknown> = { status: 'ACTIVE' };
    if (query.color?.trim()) variantFilter.color = query.color.trim();
    if (query.size?.trim()) variantFilter.size = query.size.trim();
    const price: Record<string, number> = {};
    if (query.minPrice !== undefined) price.$gte = query.minPrice;
    if (query.maxPrice !== undefined) price.$lte = query.maxPrice;
    if (Object.keys(price).length) variantFilter.price = price;
    const variantCriteria = Object.keys(variantFilter).length > 1;
    const priceSort = query.sort === 'price_asc' || query.sort === 'price_desc';
    // sort=rating: chỉ sản phẩm đã có đánh giá công khai, điểm trung bình cao trước (dùng cho "Sản phẩm nổi bật").
    const ratingSort = query.sort === 'rating';
    const skip = (query.page - 1) * query.limit;
    let rows: Array<Record<string, any>>;
    let total: number;
    if (variantCriteria || priceSort || ratingSort) {
      const match = { ...filter, ...(filter.categoryId ? { categoryId: new Types.ObjectId(String(filter.categoryId)) } : {}) };
      const [result] = await this.products.aggregate<{ items: typeof rows; count: Array<{ total: number }> }>([
        { $match: match },
        { $lookup: { from: 'product_variants', let: { productId: '$_id' }, pipeline: [
          { $match: { $expr: { $eq: ['$productId', '$$productId'] }, ...variantFilter } },
          { $group: { _id: null, minPrice: { $min: '$price' } } },
        ], as: 'variantMatch' } },
        ...(variantCriteria ? [{ $match: { 'variantMatch.0': { $exists: true } } }] : []),
        { $addFields: { displayPrice: { $ifNull: [{ $arrayElemAt: ['$variantMatch.minPrice', 0] }, '$price'] } } },
        ...(ratingSort ? [
          { $lookup: { from: 'reviews', let: { productId: '$_id' }, pipeline: [
            { $match: { $expr: { $eq: ['$productId', '$$productId'] }, status: 'PUBLIC', deletedAt: null } },
            { $group: { _id: null, avgStars: { $avg: '$stars' }, reviewCount: { $sum: 1 } } },
          ], as: 'ratingMatch' } },
          { $match: { 'ratingMatch.0': { $exists: true } } },
          { $addFields: { avgStars: { $arrayElemAt: ['$ratingMatch.avgStars', 0] }, reviewCount: { $arrayElemAt: ['$ratingMatch.reviewCount', 0] } } },
        ] : []),
        { $facet: { items: [{ $sort: priceSort ? { displayPrice: query.sort === 'price_desc' ? -1 : 1, _id: 1 }
          : ratingSort ? { avgStars: -1, reviewCount: -1, createdAt: -1, _id: 1 } : this.sortOption(query.sort) },
          { $skip: skip }, { $limit: query.limit },
          { $project: { variantMatch: 0, displayPrice: 0, ...(ratingSort ? { ratingMatch: 0, avgStars: 0, reviewCount: 0 } : {}) } }],
          count: [{ $count: 'total' }] } },
      ]).exec();
      rows = result?.items ?? []; total = result?.count[0]?.total ?? 0;
    } else {
      [rows, total] = await Promise.all([
        this.products.find(filter).sort(this.sortOption(query.sort)).skip(skip).limit(query.limit).lean().exec(),
        this.products.countDocuments(filter).exec(),
      ]);
    }
    const ids = rows.map((row) => String(row._id));
    const [variantRows, mediaRows] = await Promise.all([
      ids.length ? this.variants.find({ productId: { $in: ids }, ...variantFilter }).lean().exec() : Promise.resolve([]),
      ids.length ? this.media.find({ _id: { $in: rows.flatMap((row) => row.imageMediaIds ?? []) }, status: 'READY' }).lean().exec() : Promise.resolve([]),
    ]);
    const mediaById = new Map(mediaRows.map((item) => [String(item._id), item]));
    const byProduct = new Map<string, typeof variantRows>();
    for (const variant of variantRows) {
      const key = String(variant.productId);
      const list = byProduct.get(key) ?? [];
      list.push(variant);
      byProduct.set(key, list);
    }

    return {
      page: query.page,
      limit: query.limit,
      total,
      items: await Promise.all(rows.map((row) => this.listItem(row as unknown as Record<string, unknown>,
        byProduct.get(String(row._id)) ?? [], mediaById))),
    };
  }

  /** Giá trị lọc công khai: kích cỡ, màu và khoảng giá của biến thể ACTIVE thuộc sản phẩm đang bán. */
  async getPublicFilters(): Promise<{ sizes: string[]; colors: string[]; minPrice: number | null; maxPrice: number | null }> {
    const published = await this.products.find({ status: 'PUBLISHED' }).select('_id').lean().exec();
    const ids = published.map((row) => String(row._id));
    if (!ids.length) return { sizes: [], colors: [], minPrice: null, maxPrice: null };
    const rows = await this.variants.find({ productId: { $in: ids }, status: 'ACTIVE' }).select('size color price').lean().exec();
    const sizes = new Set<string>();
    const colors = new Set<string>();
    let minPrice: number | null = null;
    let maxPrice: number | null = null;
    for (const row of rows) {
      if (row.size?.trim()) sizes.add(row.size.trim());
      if (row.color?.trim()) colors.add(row.color.trim());
      if (typeof row.price === 'number') {
        minPrice = minPrice === null ? row.price : Math.min(minPrice, row.price);
        maxPrice = maxPrice === null ? row.price : Math.max(maxPrice, row.price);
      }
    }
    const collator = new Intl.Collator('vi', { numeric: true });
    return { sizes: [...sizes].sort(collator.compare), colors: [...colors].sort(collator.compare), minPrice, maxPrice };
  }

  async listAdmin(status?: string, page = 1, limit = 20, search: { q?: string; category?: string } = {}) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(50, Math.max(1, limit));
    const empty = { page: safePage, limit: safeLimit, total: 0, items: [] };
    const filter: Record<string, unknown> = status ? { status } : {};
    const category = search.category?.trim();
    if (category) {
      const match = Types.ObjectId.isValid(category)
        ? { $or: [{ slug: category.toLowerCase() }, { _id: category }] }
        : { slug: category.toLowerCase() };
      const found = await this.categories.findOne(match).lean().exec();
      if (!found) return empty;
      filter.categoryId = String(found._id);
    }
    const q = search.q?.trim();
    if (q) {
      const pattern = new RegExp(escapeRegex(q), 'i');
      const skuRows = await this.variants.find({ sku: pattern }).select('productId').lean().exec();
      const productIds = [...new Set(skuRows.map((row) => String(row.productId)))];
      filter.$or = [{ name: pattern }, ...(productIds.length ? [{ _id: { $in: productIds } }] : [])];
    }
    const [rows, total] = await Promise.all([
      this.products.find(filter).sort({ createdAt: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit).lean().exec(),
      this.products.countDocuments(filter).exec(),
    ]);
    // Ảnh tải lên lưu ở imageMediaIds (images chỉ chứa URL nhập tay) nên cần tra media để có ảnh bìa.
    const coverMediaIds = rows.filter((row) => !row.images?.length).flatMap((row) => row.imageMediaIds ?? []);
    const mediaRows = coverMediaIds.length
      ? await this.media.find({ _id: { $in: coverMediaIds }, status: 'READY' }).lean().exec() : [];
    const mediaById = new Map(mediaRows.map((item) => [String(item._id), item]));
    return { page: safePage, limit: safeLimit, total, items: await Promise.all(rows.map(async (row) => ({
      id: String(row._id), name: row.name, slug: row.slug, status: row.status,
      description: row.description ?? '', material: row.material ?? '', images: row.images ?? [],
      price: row.price, categoryId: row.categoryId ? String(row.categoryId) : null,
      imageMediaIds: row.imageMediaIds ?? [],
      coverImage: await this.coverImage(row as unknown as Record<string, unknown>, mediaById),
    }))) };
  }

  /** Ảnh bìa = ảnh đầu tiên theo đúng thứ tự trang chi tiết: URL nhập tay trước, rồi ảnh tải lên. */
  private async coverImage(product: Record<string, unknown>, mediaById: Map<string, { key: string; visibility: string }>) {
    const images = Array.isArray(product.images) ? product.images as string[] : [];
    if (images.length) return images[0];
    for (const mediaId of (product.imageMediaIds as string[] | undefined) ?? []) {
      const media = mediaById.get(String(mediaId));
      if (!media) continue;
      return (media.visibility === 'PUBLIC' ? this.storage.publicUrl(media.key) : null) ?? await this.storage.signedReadUrl(media.key);
    }
    return null;
  }

  async getAdminProduct(productId: string) {
    if (!Types.ObjectId.isValid(productId)) throw new NotFoundException('Product not found');
    const product = await this.products.findById(productId).lean().exec();
    if (!product) throw new NotFoundException('Product not found');
    const [variants, mediaRows] = await Promise.all([
      this.variants.find({ productId }).lean().exec(),
      this.media.find({ _id: { $in: product.imageMediaIds ?? [] }, status: 'READY' }).lean().exec(),
    ]);
    return { ...await this.detail(product as unknown as Record<string, unknown>,
      variants as unknown as Array<Record<string, unknown>>, new Map(mediaRows.map(item => [String(item._id), item]))),
      categoryId: product.categoryId ? String(product.categoryId) : null };
  }

  async getPublishedBySlug(slug: string) {
    const product = await this.products.findOne({ slug: slug.toLowerCase(), status: 'PUBLISHED' }).lean().exec();
    if (!product) throw new NotFoundException('Product not found');
    const [variants, mediaRows] = await Promise.all([
      this.variants.find({ productId: String(product._id), status: 'ACTIVE' }).lean().exec(),
      this.media.find({ _id: { $in: product.imageMediaIds ?? [] }, status: 'READY' }).lean().exec(),
    ]);
    return this.detail(product as unknown as Record<string, unknown>, variants as unknown as Array<Record<string, unknown>>, new Map(mediaRows.map((item) => [String(item._id), item])));
  }

  suggestSize(slug: string, dto: SizeSuggestionDto) {
    if (dto.bust === undefined && dto.waist === undefined && dto.hip === undefined) {
      throw new BadRequestException('At least one measurement is required');
    }
    return this.products.findOne({ slug: slug.toLowerCase(), status: 'PUBLISHED' }).lean().exec().then((product) => {
      if (!product) throw new NotFoundException('Product not found');
      const suggestion = this.computeSizeSuggestion(product.sizeGuide ?? [], dto);
      return {
        disclaimer: 'Size suggestion is indicative only',
        suggestedSize: suggestion,
        sizeGuide: (product.sizeGuide ?? []).map((row) => ({ size: row.size, measurements: row.measurements })),
      };
    });
  }

  async createProduct(dto: CreateProductDto) {
    await this.ensureCategory(dto.categoryId);
    await this.ensureMediaIdsReady(dto.imageMediaIds);
    try {
      const created = await this.products.create({
        ...dto,
        slug: dto.slug.toLowerCase(),
        images: dto.images ?? [],
        imageMediaIds: dto.imageMediaIds ?? [],
        sizeGuide: dto.sizeGuide ?? [],
      });
      if (created.imageMediaIds?.length) await this.syncMediaPublication(created.imageMediaIds);
      return { id: String(created._id), slug: created.slug };
    } catch (error: unknown) {
      if (typeof error === 'object' && error && 'code' in error && error.code === 11000) throw new ConflictException('Slug exists');
      throw error;
    }
  }

  async updateProduct(productId: string, dto: UpdateProductDto, actorId?: string) {
    if (!Types.ObjectId.isValid(productId)) throw new NotFoundException('Product not found');
    if (dto.categoryId) await this.ensureCategory(dto.categoryId);
    if (dto.imageMediaIds) await this.ensureMediaIdsReady(dto.imageMediaIds);
    try {
      const result = await withCommerceTransaction(this.connection, async (session) => {
        const current = await this.products.findById(productId).session(session).lean().exec();
        if (!current) throw new NotFoundException('Product not found');
        const updated = await this.products.findByIdAndUpdate(productId, { $set: dto },
          { new: true, runValidators: true, session }).lean().exec();
        if (!updated) throw new NotFoundException('Product not found');
        if (dto.price !== undefined && dto.price !== current.price) {
          await this.audit.record('catalog.product.price_changed', 'product', productId, actorId,
            { oldPrice: current.price, newPrice: dto.price }, session);
        }
        return { response: { id: String(updated._id), slug: updated.slug, status: updated.status },
          mediaIds: [...(current.imageMediaIds ?? []), ...(updated.imageMediaIds ?? [])].map(String) };
      });
      await this.syncMediaPublication(result.mediaIds);
      return result.response;
    } catch (error: unknown) {
      if (typeof error === 'object' && error && 'code' in error && error.code === 11000) throw new ConflictException('Slug exists');
      throw error;
    }
  }

  async listCategories(publicOnly: boolean) {
    const filter = publicOnly ? { status: 'ACTIVE' } : {};
    const items = await this.categories.find(filter).sort({ name: 1 }).lean().exec();
    return { items: items.map((item) => ({ id: String(item._id), name: item.name, slug: item.slug, parentId: item.parentId ?? null, status: item.status })) };
  }

  async createCategory(dto: CategoryDto) {
    if (dto.parentId) await this.assertCategoryParent(dto.parentId);
    try {
      const created = await this.categories.create({ ...dto, slug: dto.slug.toLowerCase() });
      return { id: String(created._id), slug: created.slug };
    } catch (error: unknown) {
      if (typeof error === 'object' && error && 'code' in error && error.code === 11000) throw new ConflictException('Category slug exists');
      throw error;
    }
  }

  async updateCategory(categoryId: string, dto: UpdateCategoryDto) {
    if (!Types.ObjectId.isValid(categoryId)) throw new NotFoundException('Category not found');
    if (dto.parentId) await this.assertCategoryParent(dto.parentId, categoryId);
    try {
      const updated = await this.categories.findByIdAndUpdate(categoryId, { $set: dto }, { new: true, runValidators: true }).lean().exec();
      if (!updated) throw new NotFoundException('Category not found');
      return { id: String(updated._id), slug: updated.slug, status: updated.status };
    } catch (error: unknown) {
      if (typeof error === 'object' && error && 'code' in error && error.code === 11000) throw new ConflictException('Category slug exists');
      throw error;
    }
  }

  private async assertCategoryParent(parentId: string, categoryId?: string): Promise<void> {
    const visited = new Set<string>();
    let cursor: string | undefined = parentId;
    while (cursor) {
      if (visited.has(cursor) || cursor === categoryId) throw new BadRequestException('Category hierarchy cannot contain a cycle');
      visited.add(cursor);
      const parent = await this.categories.findById(cursor).select('parentId').lean().exec();
      if (!parent) throw new BadRequestException('Parent category does not exist');
      cursor = parent.parentId ? String(parent.parentId) : undefined;
    }
  }

  async createVariant(productId: string, dto: VariantDto) {
    if (!Types.ObjectId.isValid(productId)) throw new NotFoundException('Product not found');
    const product = await this.products.findById(productId).exec();
    if (!product) throw new NotFoundException('Product not found');
    try {
      const created = await this.variants.create({ ...dto, productId });
      return this.variantResponse(created.toObject() as unknown as Record<string, unknown>);
    } catch (error: unknown) {
      if (typeof error === 'object' && error && 'code' in error && error.code === 11000) throw new ConflictException('SKU exists');
      throw error;
    }
  }

  async updateVariant(productId: string, variantId: string, dto: UpdateVariantDto, actorId?: string) {
    if (!Types.ObjectId.isValid(productId) || !Types.ObjectId.isValid(variantId)) throw new NotFoundException('Variant not found');
    try {
      return await withCommerceTransaction(this.connection, async (session) => {
        const current = await this.variants.findOne({ _id: variantId, productId }).session(session).lean().exec();
        if (!current) throw new NotFoundException('Variant not found');
        const updated = await this.variants.findOneAndUpdate({ _id: variantId, productId },
          { $set: dto, $inc: { version: 1 } }, { new: true, runValidators: true, session }).exec();
        if (!updated) throw new NotFoundException('Variant not found');
        if (dto.price !== undefined && dto.price !== current.price) {
          await this.audit.record('catalog.variant.price_changed', 'variant', variantId, actorId,
            { productId, oldPrice: current.price, newPrice: dto.price }, session);
        }
        return this.variantResponse(updated.toObject() as unknown as Record<string, unknown>);
      });
    } catch (error: unknown) {
      if (typeof error === 'object' && error && 'code' in error && error.code === 11000) throw new ConflictException('SKU exists');
      throw error;
    }
  }

  private sortOption(sort?: string): Record<string, 1 | -1> {
    switch (sort) {
      case 'price_asc': return { price: 1 };
      case 'price_desc': return { price: -1 };
      case 'name_asc': return { name: 1 };
      default: return { createdAt: -1 };
    }
  }

  private async listItem(
    product: Record<string, unknown>,
    variants: Array<{ price: number; stockOnHand: number; reserved: number }>,
    mediaById: Map<string, { key: string; visibility: string }>,
  ) {
    const prices = variants.length ? variants.map((v) => v.price) : [Number(product.price)];
    const available = variants.reduce((sum, v) => sum + Math.max(0, v.stockOnHand - v.reserved), 0);
    return {
      id: String(product._id),
      name: product.name,
      slug: product.slug,
      description: product.description,
      price: Math.min(...prices),
      currency: product.currency ?? 'VND',
      images: await this.resolveImages(product, mediaById),
      status: product.status,
      inStock: available > 0,
    };
  }

  private async detail(product: Record<string, unknown>, variants: Array<Record<string, unknown>>,
    mediaById: Map<string, { key: string; visibility: string }>) {
    const mappedVariants = variants.map((variant) => this.variantResponse(variant));
    const prices = mappedVariants.length ? mappedVariants.map((v) => Number(v.price)) : [Number(product.price ?? 0)];
    return {
      id: String(product._id),
      name: product.name,
      slug: product.slug,
      description: product.description,
      material: product.material ?? '',
      price: Math.min(...prices),
      currency: product.currency ?? 'VND',
      images: await this.resolveImages(product, mediaById),
      status: product.status,
      sizeGuide: (product.sizeGuide as SizeGuideRow[] | undefined)?.map((row) => ({ size: row.size, measurements: row.measurements })) ?? [],
      variants: mappedVariants,
    };
  }

  private variantResponse(variant: Record<string, unknown>) {
    const stockOnHand = Number(variant.stockOnHand ?? 0);
    const reserved = Number(variant.reserved ?? 0);
    return {
      id: String(variant._id),
      sku: variant.sku,
      size: variant.size,
      color: variant.color,
      price: variant.price,
      stockOnHand,
      reserved,
      available: Math.max(0, stockOnHand - reserved),
      status: variant.status ?? 'ACTIVE',
    };
  }

  private computeSizeSuggestion(rows: SizeGuideRow[], dto: SizeSuggestionDto): string | null {
    if (!rows.length) return null;
    let best: { size: string; score: number } | null = null;
    for (const row of rows) {
      let score = 0;
      let parts = 0;
      for (const key of ['bust', 'waist', 'hip'] as const) {
        const actual = dto[key];
        const target = row.measurements?.[key];
        if (actual === undefined || target === undefined) continue;
        parts += 1;
        score += Math.abs(actual - target);
      }
      if (!parts) continue;
      const normalized = score / parts;
      if (!best || normalized < best.score) best = { size: row.size, score: normalized };
    }
    return best?.size ?? null;
  }

  private async ensureCategory(categoryId?: string) {
    if (!categoryId) return;
    const exists = await this.categories.findById(categoryId).exec();
    if (!exists) throw new BadRequestException('Category not found');
  }

  private async ensureMediaIdsReady(mediaIds?: string[]) {
    if (!mediaIds?.length) return;
    const unique = [...new Set(mediaIds)];
    const ready = await this.media.countDocuments({
      _id: { $in: unique }, status: 'READY', purpose: 'product',
    }).exec();
    if (ready !== unique.length) throw new BadRequestException('Image media is unavailable');
  }

  private async resolveImages(product: Record<string, unknown>, mediaById: Map<string, { key: string; visibility: string }>) {
    const base = Array.isArray(product.images) ? [...product.images as string[]] : [];
    const urls = await Promise.all(((product.imageMediaIds as string[] | undefined) ?? []).map(async (mediaId) => {
      const media = mediaById.get(String(mediaId));
      if (!media) return null;
      return media.visibility === 'PUBLIC'
        ? this.storage.publicUrl(media.key) ?? this.storage.signedReadUrl(media.key)
        : this.storage.signedReadUrl(media.key);
    }));
    for (const url of urls) if (url) base.push(url);
    return base;
  }

  private async syncMediaPublication(ids: string[]): Promise<void> {
    try { await this.storage.reconcileMediaIds(ids); }
    catch (error) { this.logger.warn(`Product media sync deferred: ${error instanceof Error ? error.message : 'unknown'}`); }
  }
}
