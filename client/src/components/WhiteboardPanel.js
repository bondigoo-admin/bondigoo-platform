import React, { useState, useEffect, useRef } from 'react';
import { Stage, Layer, Line, Text, Rect, Circle, RegularPolygon, Image as KonvaImage, Transformer } from 'react-konva';
import { Resizable } from 'react-resizable';
import { PenTool, Eraser, Type, Shapes, Image, Undo, Redo, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Draggable from 'react-draggable';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { useVideoSocket } from '../contexts/SocketContext';
import 'react-resizable/css/styles.css'; // Import resizable styles

const WhiteboardPanel = ({ sessionId, onClose, userId }) => {
  const { t } = useTranslation();
  const { socket, isConnected } = useVideoSocket();
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#000000');
  const [strokeWidth, setStrokeWidth] = useState(5);
  const [fontSize, setFontSize] = useState(16);
  const [textColor, setTextColor] = useState('#000000');
  const [shapeType, setShapeType] = useState('rect');
  const [fillColor, setFillColor] = useState('#ffffff');
  const [strokeColor, setStrokeColor] = useState('#000000');
  const [lines, setLines] = useState([]);
  const [texts, setTexts] = useState([]);
  const [shapes, setShapes] = useState([]);
  const [images, setImages] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [editingTextId, setEditingTextId] = useState(null);
  const [editingTextPosition, setEditingTextPosition] = useState({ x: 0, y: 0 });
  const [history, setHistory] = useState([]);
  const [historyStep, setHistoryStep] = useState(0);
  const fileInputRef = useRef(null);
  const stageRef = useRef(null);
  const nodeRef = useRef(null);
  const [panelSize, setPanelSize] = useState({ width: 600, height: 400 });
  const [isDrawing, setIsDrawing] = useState(false);
  const [editingTextValue, setEditingTextValue] = useState('');

  // Function to get current state
  const getCurrentState = () => ({ lines, texts, images, shapes });

  // Function to set state and update history
  const setStateWithHistory = (newState) => {
    const newHistory = history.slice(0, historyStep + 1);
    setHistory([...newHistory, newState]);
    setHistoryStep(newHistory.length);
    setLines(newState.lines);
    setTexts(newState.texts);
    setImages(newState.images);
    setShapes(newState.shapes);
  };

  // Handle socket events
  useEffect(() => {
    if (!socket || !isConnected) return;

    const handleWhiteboardUpdate = (data) => {
      if (data.clear) {
        setLines([]);
        setTexts([]);
        setImages([]);
        setShapes([]);
        setHistory([{ lines: [], texts: [], images: [], shapes: [] }]);
        setHistoryStep(0);
      } else if (data.state) {
        setLines(data.state.lines);
        setTexts(data.state.texts);
        setImages(data.state.images.map((imgData) => ({ ...imgData, image: null })));
        setShapes(data.state.shapes);
      } else if (data.type === 'add-line') {
        setLines((prev) => [...prev, data.line]);
      } else if (data.type === 'add-text') {
        setTexts((prev) => [...prev, data.text]);
      } else if (data.type === 'add-image') {
        const img = new window.Image();
        img.src = data.image.url;
        img.onload = () => {
          setImages((prev) => [...prev, { ...data.image, image: img }]);
        };
      } else if (data.type === 'add-shape') {
        setShapes((prev) => [...prev, data.shape]);
      } else if (data.type === 'update-object') {
        const { id, updates } = data;
        setTexts((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
        setImages((prev) => prev.map((img) => (img.id === id ? { ...img, ...updates } : img)));
        setShapes((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
      }
    };

    socket.on('whiteboard-update', handleWhiteboardUpdate);

    return () => {
      socket.off('whiteboard-update', handleWhiteboardUpdate);
    };
  }, [socket, isConnected]);

  // Load images when images state changes
  useEffect(() => {
    images.forEach((img) => {
      if (!img.image && img.url) {
        const imageObj = new window.Image();
        imageObj.src = img.url;
        imageObj.onload = () => {
          setImages((prev) => prev.map((i) => (i.id === img.id ? { ...i, image: imageObj } : i)));
        };
      }
    });
  }, [images]);

  // Handle drawing
  const handleMouseDown = (e) => {
    const pos = e.target.getStage().getPointerPosition();
    if (tool === 'pen' || tool === 'eraser') {
      const newLine = { id: uuidv4(), tool, points: [pos.x, pos.y], color, strokeWidth };
      setLines([...lines, newLine]);
    } else if (tool === 'text') {
      const newText = { id: uuidv4(), text: 'Double-click to edit', x: pos.x, y: pos.y, fontSize, fill: textColor };
      setTexts([...texts, newText]);
      if (socket) socket.emit('whiteboard-update', { type: 'add-text', text: newText });
      setStateWithHistory({ lines, texts: [...texts, newText], shapes, images });
    } else if (tool === 'shape') {
      let newShape;
      if (shapeType === 'rect') {
        newShape = { id: uuidv4(), type: 'rect', x: pos.x, y: pos.y, width: 100, height: 50, fill: fillColor, stroke: strokeColor };
      } else if (shapeType === 'circle') {
        newShape = { id: uuidv4(), type: 'circle', x: pos.x, y: pos.y, radius: 50, fill: fillColor, stroke: strokeColor };
      } else if (shapeType === 'triangle') {
        newShape = { id: uuidv4(), type: 'triangle', x: pos.x, y: pos.y, radius: 50, fill: fillColor, stroke: strokeColor };
      }
      setShapes([...shapes, newShape]);
      if (socket) socket.emit('whiteboard-update', { type: 'add-shape', shape: newShape });
      setStateWithHistory({ lines, texts, shapes: [...shapes, newShape], images });
    }
  };

  const handleMouseMove = (e) => {
    if (!isDrawing) return;
    const stage = e.target.getStage();
    const point = stage.getPointerPosition();
    let lastLine = lines[lines.length - 1];
    lastLine.points = lastLine.points.concat([point.x, point.y]);
    setLines([...lines.slice(0, -1), lastLine]);
    if (socket) socket.emit('whiteboard-update', { type: 'add-line', line: lastLine });
  };

  const handleMouseUp = () => {
    if (isDrawing) {
      setIsDrawing(false);
      setStateWithHistory(getCurrentState());
    }
  };

  // Handle text editing
  const handleTextChange = (e) => {
    setEditingTextValue(e.target.value);
  };

  const handleTextBlur = () => {
    if (editingTextId) {
      const updatedTexts = texts.map((t) =>
        t.id === editingTextId ? { ...t, text: editingTextValue } : t
      );
      setTexts(updatedTexts);
      setEditingTextId(null);
      if (socket) socket.emit('whiteboard-update', { type: 'update-object', id: editingTextId, updates: { text: editingTextValue } });
      setStateWithHistory({ ...getCurrentState(), texts: updatedTexts });
    }
  };

  // Handle image upload
  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const { url } = await res.json();
      const img = new window.Image();
      img.src = url;
      img.onload = () => {
        const stage = stageRef.current;
        const x = 50; // Fixed position for simplicity; adjust to center if needed
        const y = 50;
        const newImage = { id: uuidv4(), image: img, x, y, width: img.width, height: img.height, url };
        setImages([...images, newImage]);
        if (socket) socket.emit('whiteboard-update', { type: 'add-image', image: { ...newImage, image: undefined } });
        setStateWithHistory({ lines, texts, shapes, images: [...images, newImage] });
      };
    } catch (error) {
      console.error('Image upload failed:', error);
    }
  };

  // Handle object transformations
  const handleTransformEnd = (e) => {
    const node = e.target;
    const id = node.id();
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    node.scaleX(1);
    node.scaleY(1);
    const updates = {
      x: node.x(),
      y: node.y(),
      width: node.width() * scaleX,
      height: node.height() * scaleY,
    };
    if (texts.some((t) => t.id === id)) {
      setTexts((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
    } else if (images.some((img) => img.id === id)) {
      setImages((prev) => prev.map((img) => (img.id === id ? { ...img, ...updates } : img)));
    } else if (shapes.some((s) => s.id === id)) {
      setShapes((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
    }
    if (socket) socket.emit('whiteboard-update', { type: 'update-object', id, updates });
    setStateWithHistory(getCurrentState());
  };

  // Handle undo
  const undo = () => {
    if (historyStep > 0) {
      const previousStep = historyStep - 1;
      setHistoryStep(previousStep);
      const previousState = history[previousStep];
      setLines(previousState.lines);
      setTexts(previousState.texts);
      setImages(previousState.images);
      setShapes(previousState.shapes);
      if (socket) socket.emit('whiteboard-update', { state: previousState });
    }
  };

  // Handle redo
  const redo = () => {
    if (historyStep < history.length - 1) {
      const nextStep = historyStep + 1;
      setHistoryStep(nextStep);
      const nextState = history[nextStep];
      setLines(nextState.lines);
      setTexts(nextState.texts);
      setImages(nextState.images);
      setShapes(nextState.shapes);
      if (socket) socket.emit('whiteboard-update', { state: nextState });
    }
  };

  // Handle clear
  const clearWhiteboard = () => {
    if (window.confirm(t('whiteboard.confirmClear'))) {
      setLines([]);
      setTexts([]);
      setImages([]);
      setShapes([]);
      setHistory([{ lines: [], texts: [], images: [], shapes: [] }]);
      setHistoryStep(0);
      if (socket) socket.emit('whiteboard-update', { clear: true });
    }
  };

  // Handle resize
  const onResize = (e, { size }) => {
    setPanelSize({ width: size.width, height: size.height });
  };

  return (
    <>
      <style>
        {`
          .whiteboard-panel {
            font-family: Arial, sans-serif;
            position: relative;
            box-sizing: border-box;
            overflow: hidden;
          }
          .resize-handle {
            position: absolute;
            bottom: 0;
            right: 0;
            width: 16px;
            height: 16px;
            background: #4b5563;
            cursor: se-resize;
            border-top-left-radius: 4px;
          }
          .tool-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 4px;
            border-radius: 4px;
          }
          .tool-btn.active {
            background-color: #3b82f6;
          }
          .color-picker {
            width: 24px;
            height: 24px;
            border-radius: 50%;
            border: 2px solid #fff;
            cursor: pointer;
          }
          .stroke-width-control {
            display: flex;
            align-items: center;
            gap: 4px;
          }
        `}
      </style>
      <Draggable nodeRef={nodeRef} handle=".drag-handle" bounds="parent">
        <Resizable
          width={panelSize.width}
          height={panelSize.height}
          onResize={onResize}
          minConstraints={[300, 200]}
          maxConstraints={[1200, 800]}
          resizeHandles={['se']}
          handle={<div className="resize-handle" />}
        >
          <div
            ref={nodeRef}
            className="whiteboard-panel bg-gray-800 text-white rounded-lg shadow-lg p-4 absolute z-[1000] pointer-events-auto"
            style={{ width: panelSize.width, height: panelSize.height }}
          >
            <div className="flex flex-col h-full">
              <div className="drag-handle flex justify-between items-center mb-2 cursor-move">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <PenTool size={20} /> {t('session.whiteboard')}
                </h3>
                <button onClick={onClose} className="p-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded" aria-label={t('close')}>
                  <X size={20} />
                </button>
              </div>
              <div className="toolbar flex gap-4 items-center p-2 bg-gray-800 text-white">
  {/* Drawing Tools */}
  <div className="drawing-tools flex gap-2 items-center">
    <button
      onClick={() => setTool('pen')}
      title={t('whiteboard.pen')}
      className={`p-2 rounded ${tool === 'pen' ? 'bg-blue-600' : 'bg-gray-600'}`}
    >
      <PenTool size={18} />
    </button>
    <button
      onClick={() => setTool('eraser')}
      title={t('whiteboard.eraser')}
      className={`p-2 rounded ${tool === 'eraser' ? 'bg-blue-600' : 'bg-gray-600'}`}
    >
      <Eraser size={18} />
    </button>
    <input
      type="color"
      value={color}
      onChange={(e) => setColor(e.target.value)}
      title={t('whiteboard.color')}
      className="w-8 h-8"
    />
    <input
      type="range"
      min="1"
      max="20"
      value={strokeWidth}
      onChange={(e) => setStrokeWidth(e.target.value)}
      title={t('whiteboard.strokeWidth')}
      className="w-20"
    />
  </div>

  {/* Text Tools */}
  <div className="text-tools flex gap-2 items-center">
    <button
      onClick={() => setTool('text')}
      title={t('whiteboard.text')}
      className={`p-2 rounded ${tool === 'text' ? 'bg-blue-600' : 'bg-gray-600'}`}
    >
      <Type size={18} />
    </button>
    <select
      value={fontSize}
      onChange={(e) => setFontSize(e.target.value)}
      title={t('whiteboard.fontSize')}
      className="bg-gray-600 rounded p-1"
    >
      <option value={12}>12px</option>
      <option value={16}>16px</option>
      <option value={20}>20px</option>
      <option value={24}>24px</option>
    </select>
    <input
      type="color"
      value={textColor}
      onChange={(e) => setTextColor(e.target.value)}
      title={t('whiteboard.textColor')}
      className="w-8 h-8"
    />
  </div>

  {/* Shape Tools */}
  <div className="shape-tools flex gap-2 items-center">
    <button
      onClick={() => setTool('shape')}
      title={t('whiteboard.shape')}
      className={`p-2 rounded ${tool === 'shape' ? 'bg-blue-600' : 'bg-gray-600'}`}
    >
      <Shapes size={18} />
    </button>
    <select
      value={shapeType}
      onChange={(e) => setShapeType(e.target.value)}
      title={t('whiteboard.shapeType')}
      className="bg-gray-600 rounded p-1"
    >
      <option value="rect">Rectangle</option>
      <option value="circle">Circle</option>
      <option value="triangle">Triangle</option>
    </select>
    <input
      type="color"
      value={fillColor}
      onChange={(e) => setFillColor(e.target.value)}
      title={t('whiteboard.fillColor')}
      className="w-8 h-8"
    />
    <input
      type="color"
      value={strokeColor}
      onChange={(e) => setStrokeColor(e.target.value)}
      title={t('whiteboard.strokeColor')}
      className="w-8 h-8"
    />
  </div>

  {/* Image Upload */}
  <div className="upload-tool">
    <button
      onClick={() => fileInputRef.current.click()}
      title={t('whiteboard.uploadImage')}
      className="p-2 rounded bg-gray-600"
    >
      <Image size={18} />
    </button>
    <input
      type="file"
      ref={fileInputRef}
      onChange={handleImageUpload}
      className="hidden"
      accept="image/*"
    />
  </div>

  {/* History Tools */}
  <div className="history-tools flex gap-2 items-center ml-auto">
    <button
      onClick={undo}
      disabled={historyStep === 0}
      title={t('whiteboard.undo')}
      className="p-2 rounded bg-gray-600 disabled:opacity-50"
    >
      <Undo size={18} />
    </button>
    <button
      onClick={redo}
      disabled={historyStep === history.length - 1}
      title={t('whiteboard.redo')}
      className="p-2 rounded bg-gray-600 disabled:opacity-50"
    >
      <Redo size={18} />
    </button>
    <button
      onClick={clearWhiteboard}
      title={t('whiteboard.clear')}
      className="p-2 rounded bg-red-600"
    >
      <Trash2 size={18} />
    </button>
  </div>
</div>
<div className="relative flex-1 bg-white rounded overflow-hidden">
  <Stage
    width={panelSize.width - 32}
    height={panelSize.height - 100}
    onMouseDown={handleMouseDown}
    ref={stageRef}
  >
    <Layer>
      {lines.map((line) => (
        <Line
          key={line.id}
          points={line.points}
          stroke={line.tool === 'eraser' ? '#ffffff' : line.color}
          strokeWidth={line.strokeWidth}
          lineCap="round"
          lineJoin="round"
        />
      ))}
      {texts.map((text) => (
        <Text
          key={text.id}
          id={text.id}
          text={text.text}
          x={text.x}
          y={text.y}
          fontSize={text.fontSize}
          fill={text.fill}
          draggable
          onClick={() => setSelectedId(text.id)}
          onDblClick={() => {
            setEditingTextId(text.id);
            setEditingTextPosition({ x: text.x, y: text.y });
          }}
          onTransformEnd={handleTransformEnd}
        />
      ))}
      {shapes.map((shape) => {
        if (shape.type === 'rect') {
          return (
            <Rect
              key={shape.id}
              id={shape.id}
              x={shape.x}
              y={shape.y}
              width={shape.width}
              height={shape.height}
              fill={shape.fill}
              stroke={shape.stroke}
              draggable
              onClick={() => setSelectedId(shape.id)}
              onTransformEnd={handleTransformEnd}
            />
          );
        } else if (shape.type === 'circle') {
          return (
            <Circle
              key={shape.id}
              id={shape.id}
              x={shape.x}
              y={shape.y}
              radius={shape.radius}
              fill={shape.fill}
              stroke={shape.stroke}
              draggable
              onClick={() => setSelectedId(shape.id)}
              onTransformEnd={handleTransformEnd}
            />
          );
        } else if (shape.type === 'triangle') {
          return (
            <RegularPolygon
              key={shape.id}
              id={shape.id}
              x={shape.x}
              y={shape.y}
              sides={3}
              radius={shape.radius}
              fill={shape.fill}
              stroke={shape.stroke}
              rotation={180}
              draggable
              onClick={() => setSelectedId(shape.id)}
              onTransformEnd={handleTransformEnd}
            />
          );
        }
        return null;
      })}
      {images.map((img) => (
        img.image && (
          <KonvaImage
            key={img.id}
            id={img.id}
            image={img.image}
            x={img.x}
            y={img.y}
            width={img.width}
            height={img.height}
            draggable
            onClick={() => setSelectedId(img.id)}
            onTransformEnd={handleTransformEnd}
          />
        )
      ))}
      {selectedId && (
        <Transformer
          ref={(node) => {
            if (node) {
              const selectedNode = stageRef.current.findOne(`#${selectedId}`);
              node.nodes(selectedNode ? [selectedNode] : []);
            }
          }}
        />
      )}
    </Layer>
  </Stage>

  {editingTextId && (
    <input
      type="text"
      value={texts.find((t) => t.id === editingTextId)?.text || ''}
      onChange={(e) => {
        const updatedTexts = texts.map((t) =>
          t.id === editingTextId ? { ...t, text: e.target.value } : t
        );
        setTexts(updatedTexts);
        if (socket) socket.emit('whiteboard-update', { type: 'update-text', text: updatedTexts.find((t) => t.id === editingTextId) });
      }}
      onBlur={() => setEditingTextId(null)}
      onKeyPress={(e) => { if (e.key === 'Enter') setEditingTextId(null); }}
      style={{
        position: 'absolute',
        top: `${editingTextPosition.y}px`,
        left: `${editingTextPosition.x}px`,
        fontSize: `${fontSize}px`,
        color: textColor,
        background: 'transparent',
        border: '1px dashed gray',
        outline: 'none',
        width: '200px',
      }}
    />
  )}
</div>
            </div>
          </div>
        </Resizable>
      </Draggable>
    </>
  );
};

export default WhiteboardPanel;