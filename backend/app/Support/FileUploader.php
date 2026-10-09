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

    public static function store(Model $model, UploadedFile|string $file): string
    {
        if (is_string($file)) {
            return self::storeMiniAppArchive($model, $file);
        }
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

    public static function storeMiniAppArchive(Model $model, string $source): string
    {
        if (! $model->exists || DB::transactionLevel() < 1) {
            throw new \LogicException('Create the version inside a transaction before storing its archive.');
        }
        $stream = @fopen($source, 'rb');
        if ($stream === false) {
            throw new \RuntimeException('The archive could not be read.');
        }
        try {
            $size = fstat($stream)['size'] ?? 0;
            $mime = (new \finfo(FILEINFO_MIME_TYPE))->buffer((string) fread($stream, 8192));
            rewind($stream);
            if ($size < 1 || $size > 5 * 1024 * 1024 || $mime !== 'application/zip') {
                throw ValidationException::withMessages(['archive' => 'Upload a ZIP no larger than 5 MB.']);
            }
            for ($attempt = 0; $attempt < 3; $attempt++) {
                $path = 'miniapps/archives/'.$model->getKey().'_'.uniqid().'.zip';
                if (Storage::disk('local')->exists($path)) {
                    continue;
                }
                if (! Storage::disk('local')->put($path, $stream)) {
                    throw new \RuntimeException('The archive could not be stored.');
                }

                return $path;
            }
        } finally {
            fclose($stream);
        }
        throw new \RuntimeException('Could not allocate an archive filename.');
    }
}
