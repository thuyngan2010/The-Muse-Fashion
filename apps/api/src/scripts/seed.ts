import mongoose from 'mongoose';
import { Product, ProductSchema } from '../modules/catalog/product.schema.js';
import { Category, CategorySchema, ProductVariant, ProductVariantSchema } from '../modules/catalog/catalog.schemas.js';
import { SystemSetting, SystemSettingSchema } from '../modules/admin/admin.schemas.js';

async function seed() {
  const uri = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/fashion_commerce';
  await mongoose.connect(uri);
  const ProductModel = mongoose.model(Product.name, ProductSchema);
  const CategoryModel = mongoose.model(Category.name, CategorySchema);
  const VariantModel = mongoose.model(ProductVariant.name, ProductVariantSchema);

  const category = await CategoryModel.findOneAndUpdate(
    { slug: 'ao' },
    { $setOnInsert: { slug: 'ao', name: 'Áo', status: 'ACTIVE' } },
    { upsert: true, new: true },
  );

  const samples = [
    {
      slug: 'ao-so-mi-linen',
      name: 'Áo sơ mi Linen',
      description: 'Áo sơ mi chất liệu linen, form thoải mái.',
      material: 'Linen',
      categoryId: category._id,
      price: 490000,
      images: [],
      status: 'PUBLISHED',
      sizeGuide: [
        { size: 'M', measurements: { bust: 92, waist: 78, hip: 98 } },
        { size: 'L', measurements: { bust: 98, waist: 84, hip: 104 } },
      ],
    },
    {
      slug: 'quan-au-basic',
      name: 'Quần âu Basic',
      description: 'Quần dáng suông cho phong cách tối giản.',
      material: 'Polyester blend',
      categoryId: category._id,
      price: 650000,
      images: [],
      status: 'PUBLISHED',
      sizeGuide: [{ size: '32', measurements: { waist: 82, hip: 96 } }],
    },
    {
      slug: 'ao-khoac-lightweight',
      name: 'Áo khoác Lightweight',
      description: 'Áo khoác nhẹ cho thời tiết giao mùa.',
      material: 'Nylon',
      categoryId: category._id,
      price: 790000,
      images: [],
      status: 'PUBLISHED',
      sizeGuide: [{ size: 'M', measurements: { bust: 94, waist: 80 } }],
    },
  ];

  for (const product of samples) {
    const saved = await ProductModel.findOneAndUpdate({ slug: product.slug }, { $setOnInsert: product }, { upsert: true, new: true });
    await VariantModel.updateOne(
      { sku: `${product.slug}-M-WHT` },
      {
        $setOnInsert: {
          productId: saved._id,
          sku: `${product.slug}-M-WHT`,
          size: 'M',
          color: 'White',
          price: product.price,
          stockOnHand: 12,
          reserved: 0,
          status: 'ACTIVE',
        },
      },
      { upsert: true },
    );
  }

  const SettingModel = mongoose.model(SystemSetting.name, SystemSettingSchema);
  const defaults = [
    { key: 'standardShippingFee', value: 30_000 },
    { key: 'freeShippingThreshold', value: 1_000_000 },
    { key: 'lowStockThreshold', value: 5 },
  ];
  for (const setting of defaults) {
    await SettingModel.updateOne({ key: setting.key }, {
      $setOnInsert: { key: setting.key, value: setting.value, updatedBy: category._id, version: 1 },
    }, { upsert: true });
  }

  console.log(`Seeded ${samples.length} demo products with category and variants (upsert, no destructive update)`);
  await mongoose.disconnect();
}
seed().catch(async (e) => { console.error('Seed failed', e.message); await mongoose.disconnect(); process.exitCode = 1; });
