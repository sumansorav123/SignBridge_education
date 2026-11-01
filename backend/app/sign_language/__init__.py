"""Sign-language processing package.

The engine is deliberately independent of MediaPipe, Three.js and speech
recognition: it receives recognized text and maps it to validated sign glosses
and animation descriptors. MediaPipe is only used on the client for optional
hand tracking / practice feedback.
"""
