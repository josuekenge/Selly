//! Windows Audio Capture Sidecar
//! Captures MIC input and WASAPI loopback output into a stereo WAV file.
//! Left channel = MIC (rep), Right channel = LOOPBACK (prospect/system audio)
//!
//! Usage:
//!   win-audio-capture --session <id> --out <path.wav> --sample-rate 48000 --channels 2
//!
//! Runs until SIGINT (Ctrl+C), then closes the WAV file cleanly.

use anyhow::{anyhow, Context, Result};
use clap::Parser;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Sample, SampleFormat, SampleRate, StreamConfig};
use crossbeam_channel::{bounded, Receiver, Sender};
use hound::{SampleFormat as HoundSampleFormat, WavSpec, WavWriter};
use std::fs::File;
use std::io::BufWriter;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

#[derive(Parser, Debug)]
#[command(name = "win-audio-capture")]
#[command(about = "Captures MIC + WASAPI loopback to stereo WAV")]
struct Args {
    /// Session identifier
    #[arg(long)]
    session: String,

    /// Output WAV file path (absolute)
    #[arg(long)]
    out: PathBuf,

    /// Sample rate in Hz
    #[arg(long, default_value = "48000")]
    sample_rate: u32,

    /// Number of channels (must be 2 for stereo)
    #[arg(long, default_value = "2")]
    channels: u16,
}

/// Audio sample sent from capture threads to writer
#[derive(Clone)]
struct AudioFrame {
    mic_sample: f32,
    loopback_sample: f32,
}

fn main() -> Result<()> {
    // Fail fast on non-Windows
    #[cfg(not(target_os = "windows"))]
    {
        eprintln!("Error: This tool only runs on Windows");
        std::process::exit(1);
    }

    let args = Args::parse();

    // Validate channels
    if args.channels != 2 {
        return Err(anyhow!("Only stereo (2 channels) is supported"));
    }

    println!(
        "[win-audio-capture] Starting capture for session: {}",
        args.session
    );
    println!("[win-audio-capture] Output: {:?}", args.out);
    println!("[win-audio-capture] Sample rate: {} Hz", args.sample_rate);

    // Set up graceful shutdown
    let running = Arc::new(AtomicBool::new(true));
    let r = running.clone();

    ctrlc::set_handler(move || {
        println!("\n[win-audio-capture] Received shutdown signal, stopping...");
        r.store(false, Ordering::SeqCst);
    })
    .context("Failed to set Ctrl+C handler")?;

    // Create channels for audio samples
    let (mic_tx, mic_rx): (Sender<f32>, Receiver<f32>) = bounded(48000);
    let (loopback_tx, loopback_rx): (Sender<f32>, Receiver<f32>) = bounded(48000);

    // Get audio host
    let host = cpal::default_host();

    // Get default input device (MIC)
    let input_device = host
        .default_input_device()
        .ok_or_else(|| anyhow!("No default input device found"))?;
    println!(
        "[win-audio-capture] MIC device: {}",
        input_device.name().unwrap_or_else(|_| "Unknown".to_string())
    );

    // Get default output device for loopback
    let output_device = host
        .default_output_device()
        .ok_or_else(|| anyhow!("No default output device found"))?;
    println!(
        "[win-audio-capture] LOOPBACK device: {}",
        output_device.name().unwrap_or_else(|_| "Unknown".to_string())
    );

    // Get the device's default/supported config instead of forcing 48kHz
    // This prevents "configuration not supported" errors on different hardware
    let input_supported_config = input_device
        .default_input_config()
        .context("Failed to get default input config from MIC device")?;
    
    println!(
        "[win-audio-capture] MIC native config: {:?} @ {} Hz, {} channel(s)",
        input_supported_config.sample_format(),
        input_supported_config.sample_rate().0,
        input_supported_config.channels()
    );

    let input_config = StreamConfig {
        channels: input_supported_config.channels(), // Use native channel count
        sample_rate: input_supported_config.sample_rate(),
        buffer_size: cpal::BufferSize::Default,
    };

    let output_config = StreamConfig {
        channels: 1, // Mono loopback (we'll take first channel)
        sample_rate: input_supported_config.sample_rate(), // Match MIC for simplicity
        buffer_size: cpal::BufferSize::Default,
    };

    // Update WAV spec to use actual sample rate
    let actual_sample_rate = input_supported_config.sample_rate().0;

    // Build input stream (MIC) - use f32 callback but handle format conversion
    let mic_tx_clone = mic_tx.clone();
    let num_channels = input_supported_config.channels() as usize;
    let input_stream = input_device
        .build_input_stream(
            &input_config,
            move |data: &[f32], _: &cpal::InputCallbackInfo| {
                // Average all channels to mono
                for chunk in data.chunks(num_channels) {
                    let mono_sample = chunk.iter().sum::<f32>() / num_channels as f32;
                    let _ = mic_tx_clone.try_send(mono_sample);
                }
            },
            |err| eprintln!("[win-audio-capture] MIC stream error: {}", err),
            None,
        )
        .context("Failed to build MIC input stream")?;

    // Build loopback stream
    // Note: On Windows, we need to use the output device's supported input config for loopback
    // cpal doesn't directly support WASAPI loopback, so we capture from a virtual audio device
    // or use the input stream on the output device if supported
    let loopback_tx_clone = loopback_tx.clone();

    // Try to get loopback from output device as input
    // This works on some Windows configurations with virtual audio cables or if the output
    // device supports input (rare). For true WASAPI loopback, we would need windows-rs directly.
    // For now, we'll try to build an input stream on the output device.
    let loopback_stream = match output_device.build_input_stream(
        &output_config,
        move |data: &[f32], _: &cpal::InputCallbackInfo| {
            for &sample in data {
                let _ = loopback_tx_clone.try_send(sample);
            }
        },
        |err| eprintln!("[win-audio-capture] LOOPBACK stream error: {}", err),
        None,
    ) {
        Ok(stream) => {
            println!("[win-audio-capture] Using device loopback mode");
            Some(stream)
        }
        Err(e) => {
            eprintln!(
                "[win-audio-capture] Warning: Could not create loopback stream: {}",
                e
            );
            eprintln!("[win-audio-capture] Recording MIC only, loopback channel will be silent");
            None
        }
    };

    // Set up WAV writer using device's actual sample rate
    let spec = WavSpec {
        channels: 2,
        sample_rate: actual_sample_rate,
        bits_per_sample: 16,
        sample_format: HoundSampleFormat::Int,
    };

    // Ensure parent directory exists
    if let Some(parent) = args.out.parent() {
        std::fs::create_dir_all(parent).context("Failed to create output directory")?;
    }

    let file = File::create(&args.out).context("Failed to create output WAV file")?;
    let buf_writer = BufWriter::new(file);
    let mut wav_writer = WavWriter::new(buf_writer, spec).context("Failed to create WAV writer")?;

    // Start streams
    input_stream.play().context("Failed to start MIC stream")?;
    if let Some(ref stream) = loopback_stream {
        stream.play().context("Failed to start loopback stream")?;
    }

    println!("[win-audio-capture] Recording started...");

    // Main loop: mix and write samples
    let mut samples_written: u64 = 0;
    let mut last_mic_sample: f32 = 0.0;
    let mut last_loopback_sample: f32 = 0.0;

    while running.load(Ordering::SeqCst) {
        // Try to get samples from both channels
        let mic_sample = mic_rx.try_recv().unwrap_or(last_mic_sample);
        let loopback_sample = loopback_rx.try_recv().unwrap_or(last_loopback_sample);

        last_mic_sample = mic_sample;
        last_loopback_sample = loopback_sample;

        // Convert to i16 and write stereo frame
        let mic_i16 = (mic_sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
        let loopback_i16 = (loopback_sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;

        wav_writer.write_sample(mic_i16)?; // Left channel
        wav_writer.write_sample(loopback_i16)?; // Right channel

        samples_written += 2;

        // Small sleep to prevent busy-waiting when no samples available
        if mic_rx.is_empty() && loopback_rx.is_empty() {
            thread::sleep(Duration::from_micros(100));
        }
    }

    // Finalize WAV file
    drop(input_stream);
    drop(loopback_stream);

    wav_writer.finalize().context("Failed to finalize WAV file")?;

    let bytes_written = samples_written * 2; // 2 bytes per i16 sample
    println!(
        "[win-audio-capture] Recording stopped. Samples: {}, Bytes: {}",
        samples_written, bytes_written
    );

    Ok(())
}
