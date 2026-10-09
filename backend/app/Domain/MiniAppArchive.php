<?php

namespace App\Domain;

use App\Models\MiniAppPackage;
use App\Models\MiniAppVersion;
use App\Models\Shop;
use App\Support\FileUploader;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use ZipArchive;

class MiniAppArchive
{
    public function import(string $source, string $visibility, ?Shop $owner): MiniAppVersion
    {
        if (! is_file($source) || filesize($source) > 5 * 1024 * 1024 || filesize($source) < 1) {
            throw ValidationException::withMessages(['archive' => 'Upload a ZIP no larger than 5 MB.']);
        }
        if (! array_key_exists($visibility, MiniAppPackage::options()) || ($visibility === 'private') !== (bool) $owner) {
            throw ValidationException::withMessages(['visibility' => 'Private packages require one owner shop; public packages have none.']);
        }
        $zip = new ZipArchive;
        if ($zip->open($source, ZipArchive::RDONLY) !== true) {
            throw ValidationException::withMessages(['archive' => 'Invalid ZIP archive.']);
        }
        try {
            if ($zip->numFiles < 2 || $zip->numFiles > 100) {
                throw ValidationException::withMessages(['archive' => 'Archive must contain 2 to 100 files.']);
            }
            $files = [];
            $seen = [];
            $total = 0;
            for ($index = 0; $index < $zip->numFiles; $index++) {
                $entry = $zip->statIndex($index);
                $name = $entry['name'];
                if (! preg_match('/\A[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_.-]+)*\.(?:html|js|css|png|jpg|jpeg|webp|svg|json)\z/D', $name) || str_contains($name, '..') || isset($seen[strtolower($name)])) {
                    throw ValidationException::withMessages(['archive' => 'Archive contains an unsafe or duplicate path.']);
                }
                $seen[strtolower($name)] = true;
                $zip->getExternalAttributesIndex($index, $opsys, $attributes);
                $fileType = ($attributes >> 16) & 0170000;
                if ($opsys === ZipArchive::OPSYS_UNIX && $fileType !== 0 && $fileType !== 0100000) {
                    throw ValidationException::withMessages(['archive' => 'Links and non-files are forbidden.']);
                }
                $size = $entry['size'];
                $total += $size;
                if ($size > 2 * 1024 * 1024 || $total > 10 * 1024 * 1024 || $entry['comp_size'] === 0 && $size > 0 || $entry['comp_size'] > 0 && $size / $entry['comp_size'] > 100) {
                    throw ValidationException::withMessages(['archive' => 'Archive exceeds expansion limits.']);
                }
                $bytes = @$zip->getFromIndex($index);
                if ($bytes === false || strlen($bytes) !== $size || sprintf('%u', crc32($bytes)) !== sprintf('%u', $entry['crc'])) {
                    throw ValidationException::withMessages(['archive' => 'Archive contains a damaged file.']);
                }
                $extension = strtolower(pathinfo($name, PATHINFO_EXTENSION));
                if (in_array($extension, ['png', 'jpg', 'jpeg', 'webp'], true)) {
                    $image = @getimagesizefromstring($bytes);
                    $allowedMime = ['png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'webp' => 'image/webp'];
                    if (! $image || ($image['mime'] ?? null) !== $allowedMime[$extension]) {
                        throw ValidationException::withMessages(['archive' => 'Image content does not match its extension.']);
                    }
                } elseif (! mb_check_encoding($bytes, 'UTF-8') || str_contains($bytes, "\0") || $extension === 'svg' && (! preg_match('/<svg\b/i', $bytes) || preg_match('/<!DOCTYPE|<!ENTITY/i', $bytes))) {
                    throw ValidationException::withMessages(['archive' => 'Text asset content is invalid.']);
                }
                if ($extension === 'json' && ! json_validate($bytes)) {
                    throw ValidationException::withMessages(['archive' => 'JSON asset is invalid.']);
                }
                $files[$name] = $bytes;
            }
            if (! isset($files['manifest.json'])) {
                throw ValidationException::withMessages(['manifest' => 'manifest.json is required.']);
            }
            $manifest = json_decode($files['manifest.json'], true);
            if (! is_array($manifest) || array_diff(array_keys($manifest), ['id', 'name', 'version', 'entry', 'capabilities']) || count($manifest) !== 5 || ! is_string($manifest['id']) || ! preg_match('/\A[a-z][a-z0-9-]{1,79}\z/D', $manifest['id']) || ! is_string($manifest['name']) || mb_strlen($manifest['name']) < 1 || mb_strlen($manifest['name']) > 120 || ! is_string($manifest['version']) || strlen($manifest['version']) > 40 || ! preg_match('/\A[0-9]+\.[0-9]+\.[0-9]+\z/D', $manifest['version']) || ! is_string($manifest['entry']) || ! str_ends_with($manifest['entry'], '.html') || ! isset($files[$manifest['entry']]) || ! is_array($manifest['capabilities']) || ! array_is_list($manifest['capabilities']) || count($manifest['capabilities']) > 5 || count(array_filter($manifest['capabilities'], 'is_string')) !== count($manifest['capabilities']) || count($manifest['capabilities']) !== count(array_unique($manifest['capabilities'])) || array_diff($manifest['capabilities'], config('miniapps.capabilities'))) {
                throw ValidationException::withMessages(['manifest' => 'Invalid Mini App manifest.']);
            }
            $digest = hash_file('sha256', $source);
            $archivePath = null;
            $ownsAssets = false;
            $assetPrefix = 'miniapps/assets/'.$digest.'/';
            try {
                return DB::transaction(function () use ($source, $visibility, $owner, $manifest, $digest, $files, $assetPrefix, &$archivePath, &$ownsAssets): MiniAppVersion {
                    $package = MiniAppPackage::where('slug', $manifest['id'])->lockForUpdate()->first();
                    if ($package && ($package->visibility !== $visibility || $package->owner_shop_id !== $owner?->id)) {
                        throw ValidationException::withMessages(['manifest' => 'Package ownership or visibility differs.']);
                    }
                    $package ??= MiniAppPackage::create(['slug' => $manifest['id'], 'name' => $manifest['name'], 'visibility' => $visibility, 'owner_shop_id' => $owner?->id]);
                    if (MiniAppVersion::withTrashed()->where('package_id', $package->id)->where('version', $manifest['version'])->exists()) {
                        throw ValidationException::withMessages(['version' => 'This version is already reserved.']);
                    }
                    $version = MiniAppVersion::create(['package_id' => $package->id, 'version' => $manifest['version'], 'digest' => $digest, 'archive_path' => '', 'asset_hashes' => [], 'manifest' => $manifest]);
                    $archivePath = FileUploader::store($version, $source);
                    $version->update(['archive_path' => $archivePath, 'asset_hashes' => array_map(fn (string $bytes): string => hash('sha256', $bytes), $files)]);
                    $ownsAssets = true;
                    foreach ($files as $name => $bytes) {
                        if (! Storage::disk('local')->put($assetPrefix.$name, $bytes)) {
                            throw new \RuntimeException('Could not store Mini App assets.');
                        }
                    }

                    return $version;
                });
            } catch (\Throwable $error) {
                if ($archivePath) {
                    Storage::disk('local')->delete($archivePath);
                }
                if ($ownsAssets) {
                    Storage::disk('local')->deleteDirectory(rtrim($assetPrefix, '/'));
                }
                throw $error;
            }
        } finally {
            $zip->close();
        }
    }
}
