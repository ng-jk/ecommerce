<?php

namespace App\Support;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class FileUploader
{
    private const Extensions = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];

    public static function store(Model $model, UploadedFile $file): string
    {
        if (! $model->exists || DB::transactionLevel() < 1) {
            throw new \LogicException('Create the row inside a transaction before storing its upload.');
        }
        $extension = self::Extensions[$file->getMimeType()] ?? null;
        if (! $file->isValid() || ! $extension || $file->getSize() > 5 * 1024 * 1024) {
            throw ValidationException::withMessages(['file' => 'Upload a JPEG, PNG, or WebP image no larger than 5 MB.']);
        }
        for ($attempt = 0; $attempt < 3; $attempt++) {
            $name = $model->getKey().'_'.uniqid().'.'.$extension;
            $path = 'images/'.$name;
            if (Storage::disk('public')->exists($path)) {
                continue;
            }
            $stored = Storage::disk('public')->putFileAs('images', $file, $name);
            if (! $stored) {
                throw new \RuntimeException('The upload could not be stored.');
            }

            return $stored;
        }
        throw new \RuntimeException('Could not allocate a unique upload filename.');
    }

    public static function createWithUpload(callable $create, UploadedFile $file, string $column): Model
    {
        $path = null;
        try {
            return DB::transaction(function () use ($create, $file, $column, &$path): Model {
                $model = $create();
                $path = self::store($model, $file);
                $model->forceFill([$column => $path])->save();

                return $model;
            });
        } catch (\Throwable $error) {
            if ($path) {
                Storage::disk('public')->delete($path);
            }
            throw $error;
        }
    }
}
