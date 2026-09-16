import {
  Injectable,
  NotFoundException,
  ConflictException,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Category, CategoryDocument } from './schemas/category.schema';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { RedisService } from '../redis/redis.service';

// ─── Seed data from the provided category list ────────────────────────────────
const SEED_CATEGORIES = [
  'AI & Innovation',
  'Animation',
  'Creative Writing',
  'Crafts',
  'Drawing & Painting',
  'Digital Illustration',
  'Education',
  'Film & Video',
  'Graphic Design',
  'Music',
  'Marketing',
  'UI/UX Design',
];

@Injectable()
export class CategoryService implements OnModuleInit {
  private readonly logger = new Logger(CategoryService.name);
  private readonly CACHE_KEY = 'categories:all';

  constructor(
    @InjectModel(Category.name)
    private categoryModel: Model<CategoryDocument>,
    private readonly redisService: RedisService,
  ) {}

  // ─── Auto-seed on startup ────────────────────────────────────────────────────
  async onModuleInit() {
    const count = await this.categoryModel.countDocuments();
    if (count === 0) {
      await this.categoryModel.insertMany(
        SEED_CATEGORIES.map((name) => ({ category_name: name })),
      );
      this.logger.log(`✅ Seeded ${SEED_CATEGORIES.length} categories`);
      await this.redisService.del(this.CACHE_KEY);
    }
  }

  // ─── GET all categories ───────────────────────────────────────────────────────
  async findAll() {
    const cached = await this.redisService.get(this.CACHE_KEY);
    if (cached) {
      return cached;
    }

    const categories = await this.categoryModel
      .find({ isActive: true })
      .select('_id category_name description')
      .sort({ category_name: 1 });

    const result = {
      status: true,
      message: 'Categories fetched successfully',
      data: categories.map((cat) => ({
        category_id: String(cat._id),
        category_name: cat.category_name,
        name: cat.category_name,
        label: cat.category_name,
        value: String(cat._id),
        description: cat.description,
      })),
    };

    // Cache categories for 24 hours (86400 seconds)
    await this.redisService.set(this.CACHE_KEY, result, 86400);

    return result;
  }

  // ─── GET single category ──────────────────────────────────────────────────────
  async findById(id: string) {
    const cat = await this.categoryModel.findById(id);
    if (!cat) throw new NotFoundException('Category not found');
    return {
      status: true,
      data: {
        category_id: cat._id,
        category_name: cat.category_name,
        description: cat.description,
      },
    };
  }

  // ─── CREATE ───────────────────────────────────────────────────────────────────
  async create(dto: CreateCategoryDto) {
    const existing = await this.categoryModel.findOne({
      category_name: { $regex: new RegExp(`^${dto.category_name}$`, 'i') },
    });
    if (existing) throw new ConflictException('Category already exists');

    const cat = await this.categoryModel.create(dto);
    await this.redisService.del(this.CACHE_KEY);
    return {
      status: true,
      message: 'Category created successfully',
      data: { category_id: cat._id, category_name: cat.category_name },
    };
  }

  // ─── UPDATE ───────────────────────────────────────────────────────────────────
  async update(id: string, dto: UpdateCategoryDto) {
    const cat = await this.categoryModel.findByIdAndUpdate(id, dto, {
      new: true,
    });
    if (!cat) throw new NotFoundException('Category not found');
    await this.redisService.del(this.CACHE_KEY);
    return {
      status: true,
      message: 'Category updated successfully',
      data: { category_id: cat._id, category_name: cat.category_name },
    };
  }

  // ─── DELETE ───────────────────────────────────────────────────────────────────
  async delete(id: string) {
    const cat = await this.categoryModel.findByIdAndDelete(id);
    if (!cat) throw new NotFoundException('Category not found');
    await this.redisService.del(this.CACHE_KEY);
    return { status: true, message: 'Category deleted successfully' };
  }

}
