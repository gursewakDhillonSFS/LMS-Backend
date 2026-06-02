import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { CategoryService } from './category.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('auth/course/v1')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  // ─── Public: used by student onboarding topics step ──────────────────────────
  // GET /auth/course/v1/get-all-category
  @Get('get-all-category')
  findAll() {
    return this.categoryService.findAll();
  }

  // GET /auth/course/v1/get-category/:id
  @Get('get-category/:id')
  findById(@Param('id') id: string) {
    return this.categoryService.findById(id);
  }

  // ─── Protected: admin/instructor management ───────────────────────────────────
  // POST /auth/course/v1/create-category
  @Post('create-category')
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: CreateCategoryDto) {
    return this.categoryService.create(dto);
  }

  // PUT /auth/course/v1/update-category/:id
  @Put('update-category/:id')
  @UseGuards(JwtAuthGuard)
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categoryService.update(id, dto);
  }

  // DELETE /auth/course/v1/delete-category/:id
  @Delete('delete-category/:id')
  @UseGuards(JwtAuthGuard)
  delete(@Param('id') id: string) {
    return this.categoryService.delete(id);
  }
}
