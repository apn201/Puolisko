<?php
// GET -> { needsCode, configured }
require __DIR__ . '/_lib.php';
pk_json(200, [
    'needsCode' => pk_config('ACCESS_CODE') !== '',
    'configured' => pk_config('YOUCAM_API_KEY') !== '',
]);
