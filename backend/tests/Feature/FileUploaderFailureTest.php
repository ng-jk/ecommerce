<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\Shop;
use App\Support\FileUploader;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

class FileUploaderFailureTest extends TestCase
{
    use RefreshDatabase;

    private function product(): Product
    {
        $shop = Shop::create(['slug' => 'fashion', 'name' => 'Fashion']);

        return Product::create(['shop_id' => $shop->id, 'name' => 'Image', 'category' => 'Test', 'description' => 'Test', 'image_url' => 'https://example.com/a.png', 'price' => 100, 'stock' => 1, 'active' => true]);
    }

    private function image(): UploadedFile
    {
        return UploadedFile::fake()->createWithContent('photo.png', base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII='));
    }

    public function test_filename_collisions_stop_after_three_attempts(): void
    {
        $product = $this->product();
        $disk = \Mockery::mock(FilesystemAdapter::class);
        $disk->shouldReceive('exists')->times(3)->andReturn(true);
        Storage::shouldReceive('disk')->with('public')->times(3)->andReturn($disk);

        $this->expectExceptionMessage('Could not allocate a unique upload filename.');
        DB::transaction(fn () => FileUploader::store($product, $this->image()));
    }

    public function test_storage_failure_does_not_persist_a_new_model(): void
    {
        $product = $this->product();
        $disk = \Mockery::mock(FilesystemAdapter::class);
        $disk->shouldReceive('exists')->once()->andReturn(false);
        $disk->shouldReceive('putFileAs')->once()->andReturn(false);
        Storage::shouldReceive('disk')->with('public')->twice()->andReturn($disk);
        try {
            FileUploader::createWithUpload(function () use ($product) {
                $copy = $product->replicate();
                $copy->code = (string) Str::uuid();
                $copy->save();

                return $copy;
            }, $this->image(), 'image_url');
            $this->fail('Storage failure must not succeed.');
        } catch (\RuntimeException $error) {
            $this->assertSame('The upload could not be stored.', $error->getMessage());
        }
        $this->assertDatabaseCount('products', 1);
    }

    public function test_failed_path_update_rolls_back_model_and_removes_uploaded_file(): void
    {
        Storage::fake('public');
        $product = $this->product();
        Product::saving(function (Product $model): void {
            if (str_starts_with($model->image_url, 'images/')) {
                throw new \RuntimeException('Path update failed');
            }
        });
        try {
            FileUploader::createWithUpload(function () use ($product) {
                $copy = $product->replicate();
                $copy->code = (string) Str::uuid();
                $copy->save();

                return $copy;
            }, $this->image(), 'image_url');
            $this->fail('A failed path update must roll back.');
        } catch (\RuntimeException $error) {
            $this->assertSame('Path update failed', $error->getMessage());
        }
        $this->assertDatabaseCount('products', 1);
        $this->assertSame([], Storage::disk('public')->allFiles());
    }
}
