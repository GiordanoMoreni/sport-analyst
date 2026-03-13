// src/hooks/useVideoPlayer.ts

import { useRef, useState, useCallback, useEffect } from 'react';

export function useVideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoName, setVideoName] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);
  const [playbackRate, setPlaybackRateState] = useState(1);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onDurationChange = () => setDuration(video.duration || 0);
    const onLoadedMetadata = () => {
      setDuration(video.duration || 0);
      setCurrentTime(video.currentTime || 0);
    };
    const onSeeked = () => setCurrentTime(video.currentTime);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);
    const onLoadedData = () => setIsLoaded(true);

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('durationchange', onDurationChange);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);
    video.addEventListener('loadeddata', onLoadedData);

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('durationchange', onDurationChange);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('loadeddata', onLoadedData);
    };
  }, [videoSrc]);

  const loadVideo = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    setVideoSrc(url);
    setVideoName(file.name);
    setIsLoaded(false);
    setCurrentTime(0);
    setDuration(0);
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  }, []);

  const seek = useCallback((time: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(time, duration));
  }, [duration]);

  const seekRelative = useCallback((delta: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.currentTime + delta, duration));
  }, [duration]);

  const stepFrame = useCallback((forward: boolean) => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.currentTime = Math.max(0, Math.min(
      video.currentTime + (forward ? 1 / 30 : -1 / 30),
      duration
    ));
  }, [duration]);

  const changeVolume = useCallback((v: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = v;
    setVolume(v);
  }, []);

  const setPlaybackRate = useCallback((rate: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = rate;
    setPlaybackRateState(rate);
  }, []);

  const pause = useCallback(() => {
    videoRef.current?.pause();
  }, []);

  return {
    videoRef,
    isPlaying,
    currentTime,
    duration,
    volume,
    videoSrc,
    videoName,
    isLoaded,
    playbackRate,
    loadVideo,
    togglePlay,
    seek,
    seekRelative,
    stepFrame,
    changeVolume,
    setPlaybackRate,
    pause,
  };
}
