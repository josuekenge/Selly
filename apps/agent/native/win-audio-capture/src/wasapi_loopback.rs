//! WASAPI Loopback Audio Capture for Windows
//! Captures system audio output using WASAPI loopback mode

#![cfg(windows)]

use anyhow::{anyhow, Context, Result};
use crossbeam_channel::Sender;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use windows::core::*;
use windows::Win32::Foundation::*;
use windows::Win32::Media::Audio::*;
use windows::Win32::Media::KernelStreaming::*;
use windows::Win32::System::Com::*;
use windows::Win32::System::Threading::*;

const REFTIMES_PER_SEC: i64 = 10_000_000;
const REFTIMES_PER_MILLISEC: i64 = 10_000;

pub struct WasapiLoopbackCapture {
    running: Arc<AtomicBool>,
    sample_tx: Sender<f32>,
}

impl WasapiLoopbackCapture {
    pub fn new(sample_tx: Sender<f32>, running: Arc<AtomicBool>) -> Self {
        Self { running, sample_tx }
    }

    /// Start WASAPI loopback capture in a background thread
    pub fn start(self) -> Result<thread::JoinHandle<Result<()>>> {
        let handle = thread::spawn(move || {
            self.run_capture_loop()
        });
        Ok(handle)
    }

    fn run_capture_loop(&self) -> Result<()> {
        unsafe {
            // Initialize COM for this thread
            CoInitializeEx(None, COINIT_MULTITHREADED)
                .context("Failed to initialize COM")?;

            let result = self.capture_audio();

            // Clean up COM
            CoUninitialize();

            result
        }
    }

    unsafe fn capture_audio(&self) -> Result<()> {
        // Create device enumerator
        let enumerator: IMMDeviceEnumerator = CoCreateInstance(
            &MMDeviceEnumerator,
            None,
            CLSCTX_ALL,
        )
        .context("Failed to create device enumerator")?;

        // Get default audio endpoint for rendering (speakers/headphones)
        let device = enumerator
            .GetDefaultAudioEndpoint(eRender, eConsole)
            .context("Failed to get default audio endpoint")?;

        // Activate audio client
        let audio_client: IAudioClient = device
            .Activate(CLSCTX_ALL, None)
            .context("Failed to activate audio client")?;

        // Get the mix format
        let mix_format = audio_client
            .GetMixFormat()
            .context("Failed to get mix format")?;

        let wave_format = &*mix_format;
        println!(
            "[WASAPI] Loopback format: {} channels @ {} Hz, {} bits",
            wave_format.nChannels,
            wave_format.nSamplesPerSec,
            wave_format.wBitsPerSample
        );

        // Initialize audio client in loopback mode
        let buffer_duration = REFTIMES_PER_SEC / 10; // 100ms buffer
        audio_client
            .Initialize(
                AUDCLNT_SHAREMODE_SHARED,
                AUDCLNT_STREAMFLAGS_LOOPBACK,
                buffer_duration,
                0,
                mix_format,
                None,
            )
            .context("Failed to initialize audio client")?;

        // Get buffer size
        let buffer_frame_count = audio_client
            .GetBufferSize()
            .context("Failed to get buffer size")?;

        // Get capture client
        let capture_client: IAudioCaptureClient = audio_client
            .GetService()
            .context("Failed to get capture client")?;

        // Start audio client
        audio_client.Start().context("Failed to start audio client")?;

        println!("[WASAPI] Loopback capture started");

        // Capture loop
        while self.running.load(Ordering::SeqCst) {
            // Sleep for half the buffer duration
            Sleep(buffer_duration as u32 / REFTIMES_PER_MILLISEC as u32 / 2);

            // Get next packet
            loop {
                let packet_length = capture_client
                    .GetNextPacketSize()
                    .context("Failed to get packet size")?;

                if packet_length == 0 {
                    break;
                }

                // Get the buffer
                let mut data: *mut u8 = std::ptr::null_mut();
                let mut num_frames_available: u32 = 0;
                let mut flags: u32 = 0;

                capture_client
                    .GetBuffer(
                        &mut data,
                        &mut num_frames_available,
                        &mut flags,
                        None,
                        None,
                    )
                    .context("Failed to get buffer")?;

                // Process audio data
                if data.is_null() || num_frames_available == 0 {
                    capture_client
                        .ReleaseBuffer(num_frames_available)
                        .context("Failed to release buffer")?;
                    continue;
                }

                // Check for silence flag
                if flags & AUDCLNT_BUFFERFLAGS_SILENT.0 != 0 {
                    // Send silence
                    for _ in 0..num_frames_available {
                        let _ = self.sample_tx.try_send(0.0);
                    }
                } else {
                    // Convert and send samples
                    self.process_buffer(
                        data,
                        num_frames_available,
                        wave_format.nChannels,
                        wave_format.wBitsPerSample,
                    )?;
                }

                // Release the buffer
                capture_client
                    .ReleaseBuffer(num_frames_available)
                    .context("Failed to release buffer")?;
            }
        }

        // Stop audio client
        audio_client.Stop().context("Failed to stop audio client")?;

        println!("[WASAPI] Loopback capture stopped");

        Ok(())
    }

    unsafe fn process_buffer(
        &self,
        data: *const u8,
        num_frames: u32,
        num_channels: u16,
        bits_per_sample: u16,
    ) -> Result<()> {
        match bits_per_sample {
            16 => {
                // 16-bit PCM
                let samples = std::slice::from_raw_parts(
                    data as *const i16,
                    (num_frames * num_channels as u32) as usize,
                );
                for chunk in samples.chunks(num_channels as usize) {
                    // Average channels to mono
                    let mono_sample: f32 = chunk.iter()
                        .map(|&s| s as f32 / i16::MAX as f32)
                        .sum::<f32>() / num_channels as f32;
                    let _ = self.sample_tx.try_send(mono_sample);
                }
            }
            32 => {
                // 32-bit float
                let samples = std::slice::from_raw_parts(
                    data as *const f32,
                    (num_frames * num_channels as u32) as usize,
                );
                for chunk in samples.chunks(num_channels as usize) {
                    // Average channels to mono
                    let mono_sample: f32 = chunk.iter().sum::<f32>() / num_channels as f32;
                    let _ = self.sample_tx.try_send(mono_sample);
                }
            }
            _ => {
                return Err(anyhow!(
                    "Unsupported bit depth: {} bits",
                    bits_per_sample
                ));
            }
        }
        Ok(())
    }
}
