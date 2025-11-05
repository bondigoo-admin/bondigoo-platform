
import { renderHook, act } from '@testing-library/react-hooks';
import useVideoConference from '../hooks/useVideoConference';
import io from 'socket.io-client';

jest.mock('socket.io-client', () => {
  const emit = jest.fn();
  const on = jest.fn();
  const socket = { emit, on, disconnect: jest.fn(), connect: jest.fn() };
  return jest.fn(() => socket);
});

jest.mock('simple-peer', () => {
  return jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    signal: jest.fn(),
    destroy: jest.fn(),
    replaceTrack: jest.fn(),
  }));
});

describe('useVideoConference', () => {
  let mockMediaStream;

  beforeEach(() => {
    mockMediaStream = {
      getAudioTracks: jest.fn().mockReturnValue([{ enabled: true }]),
      getVideoTracks: jest.fn().mockReturnValue([{ enabled: true }]),
      getTracks: jest.fn().mockReturnValue([{ stop: jest.fn() }]),
    };
    global.navigator.mediaDevices = {
      getUserMedia: jest.fn().mockResolvedValue(mockMediaStream),
      getDisplayMedia: jest.fn().mockResolvedValue(mockMediaStream),
    };
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('initializes with no stream and not connected', () => {
    const { result } = renderHook(() => useVideoConference('test-id', 'test-token'));
    expect(result.current.localStream).toBeNull();
    expect(result.current.isConnected).toBe(false);
    expect(result.current.participants).toEqual([]);
  });

  it('starts session and initializes stream', async () => {
    const { result, waitForNextUpdate } = renderHook(() =>
      useVideoConference('test-id', 'test-token', { video: true, audio: true })
    );
    await act(async () => {
      result.current.startSession();
      await waitForNextUpdate();
    });
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ video: true, audio: true });
    expect(result.current.localStream).toBe(mockMediaStream);
    expect(io).toHaveBeenCalledWith(`${process.env.REACT_APP_API_URL}/video`, expect.any(Object));
  });

  it('handles media access error', async () => {
    navigator.mediaDevices.getUserMedia.mockRejectedValueOnce(new Error('Permission denied'));
    const { result, waitForNextUpdate } = renderHook(() =>
      useVideoConference('test-id', 'test-token', { video: true, audio: true })
    );
    await act(async () => {
      result.current.startSession();
      await waitForNextUpdate();
    });
    expect(result.current.error).toBe('Failed to access camera and microphone. Please check your permissions or device availability.');
    expect(result.current.localStream).toBeNull();
  });

  it('toggles audio', async () => {
    const { result, waitForNextUpdate } = renderHook(() =>
      useVideoConference('test-id', 'test-token', { video: true, audio: true })
    );
    await act(async () => {
      result.current.startSession();
      await waitForNextUpdate();
    });
    expect(result.current.localStream.getAudioTracks()[0].enabled).toBe(true);
    act(() => {
      result.current.toggleAudio();
    });
    expect(result.current.localStream.getAudioTracks()[0].enabled).toBe(false);
  });

  it('ends session and cleans up', async () => {
    const { result, waitForNextUpdate } = renderHook(() =>
      useVideoConference('test-id', 'test-token', { video: true, audio: true })
    );
    await act(async () => {
      result.current.startSession();
      await waitForNextUpdate();
    });
    await act(async () => {
      result.current.endSession();
    });
    expect(result.current.isConnected).toBe(false);
    expect(result.current.localStream.getTracks()[0].stop).toHaveBeenCalled();
  });
});