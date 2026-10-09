'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),gate=JSON.parse(fs.readFileSync(path.join(root,'release-validation.json'))),version=JSON.parse(fs.readFileSync(path.join(root,'plugin/manifest.json'))).version;
if(gate.schema!=='halftone-release-validation'||gate.version!==version)throw Error('Release validation does not match package.');
const expected=['official_ccx_packaging','clean_install_supported_hosts','native_photoshop_validation','native_panel_keyboard_and_sliders','large_image_memory_latency_cancel','native_batch_resume_after_restart','rip_size_color_and_alpha','transfer_adhesion_and_wash'];
const missing=expected.filter(k=>gate.required?.[k]?.passed!==true||!gate.required[k].evidence?.trim());
if(missing.length){console.error('Not ready for stable release. Evidence required: '+missing.join(', '));process.exitCode=1;}else console.log('Release evidence recorded. Automated checks must also pass.');
