import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';

interface DecalItem {
	id: string;
	type: string;
	name?: string;
	mesh: THREE.Mesh;
	targetMesh: THREE.Mesh;
	texture: THREE.Texture;
	position: THREE.Vector3;
	normal: THREE.Vector3;
	scale: number;
	rotation: number;

	// Text specific properties
	textString?: string;
	textColor?: string;
	textCurvature?: number;
	fontFamily?: string;
	letterSpacing?: number;
}

document.addEventListener('DOMContentLoaded', () => {
	// Read initial state from URL query params (client-side, works for static sites)
	const urlParams = new URLSearchParams(window.location.search);
	const urlColor = urlParams.get('color') || '#F4F1EA';
	const urlColorName = urlParams.get('colorName') || 'Blanco Hueso';
	const urlSize = urlParams.get('size') || '';
	const urlProduct = urlParams.get('product') || '';

	// Update panel header badges dynamically
	const productBadgeEl = document.getElementById('product-name-badge');
	const colorBadgeEl = document.getElementById('color-size-badge');
	if (productBadgeEl && urlProduct) productBadgeEl.textContent = urlProduct;
	if (colorBadgeEl && (urlColorName !== 'Blanco Hueso' || urlSize)) {
		colorBadgeEl.style.display = 'inline-block';
		colorBadgeEl.textContent = '🎨 Color: ' + urlColorName + (urlSize ? ' · Talla: ' + urlSize : '');
	}

	const container = document.getElementById('viewport-container');
	const canvas = document.getElementById('webgl-canvas') as HTMLCanvasElement;
	const loadingOverlay = document.getElementById('loading-overlay');
	const loadingText = document.getElementById('loading-text');
	const progressBar = document.getElementById('progress-bar');

	if (!container || !canvas) return;

	// 1. Scene, Camera, Renderer Setup
	const scene = new THREE.Scene();
	// Use theme background color
	const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
	scene.background = new THREE.Color(isDark ? '#1e293b' : '#F8FAFC');
	// Listen for theme changes
	const themeObserver = new MutationObserver(() => {
		const d = document.documentElement.getAttribute('data-theme') === 'dark';
		scene.background = new THREE.Color(d ? '#1e293b' : '#F8FAFC');
	});
	themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

	const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
	camera.position.set(0, 0, 2.8);

	const renderer = new THREE.WebGLRenderer({
		canvas,
		antialias: true,
		preserveDrawingBuffer: true
	});
	renderer.setSize(container.clientWidth, container.clientHeight);
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
	renderer.outputColorSpace = THREE.SRGBColorSpace;

	// 2. Lighting Setup
	const ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
	scene.add(ambientLight);

	const mainLight = new THREE.DirectionalLight(0xffffff, 1.6);
	mainLight.position.set(3, 4, 3);
	scene.add(mainLight);

	const fillLight = new THREE.DirectionalLight(0xffffff, 0.8);
	fillLight.position.set(-3, 2, -2);
	scene.add(fillLight);

	const backLight = new THREE.DirectionalLight(0xffffff, 0.5);
	backLight.position.set(0, 3, -4);
	scene.add(backLight);

	// 3. OrbitControls Setup
	const controls = new OrbitControls(camera, renderer.domElement);
	controls.enableDamping = true;
	controls.dampingFactor = 0.05;
	controls.minDistance = 1.2;
	controls.maxDistance = 5.0;
	controls.maxPolarAngle = Math.PI / 1.8;

	// 4. Variables & State Management
	const shirtMeshes: THREE.Mesh[] = [];
	const decalItems: DecalItem[] = [];
	let selectedDecalItem: DecalItem | null = null;
	let isDraggingDecal = false;

	type CategoryTab = 'color' | 'decal' | 'text';
	let activeCategoryTab: CategoryTab = 'color';

	type Mode = 'rotate' | 'decal' | 'move' | 'remove';
	let currentMode: Mode = 'rotate';

	let currentShirtColorHex = "#F4F1EA";
	let currentShirtColorName = "Blanco Hueso";

	// Logo State
	let activeDecalTexture: THREE.Texture | null = null;
	let activeDecalName = "Logo SEMIREYS";
	let currentDecalScale = 0.15;
	let currentDecalRotation = 0;

	// Text State
	let currentTextString = "SEMIREYS";
	let currentTextColor = "#1B2A4A";
	let currentTextCurvature = 0; // -100 to +100
	let currentFontFamily = 'Plus Jakarta Sans';
	let currentTextLetterSpacing = 0; // 0 to 40px
	let currentTextScale = 0.30;
	let currentTextRotation = 0;
	let activeTextTexture: THREE.Texture | null = null;

	const raycaster = new THREE.Raycaster();
	const mouse = new THREE.Vector2();

	// UI Elements
	const modeRotateBtn = document.getElementById('mode-rotate-btn');
	const modeDecalBtn = document.getElementById('mode-decal-btn');
	const modeMoveBtn = document.getElementById('mode-move-btn');
	const modeRemoveBtn = document.getElementById('mode-remove-decals-btn');
	const modeShareToolbarBtn = document.getElementById('mode-share-toolbar-btn');

	const modeDecalBtnLabel = document.getElementById('mode-decal-btn-label');
	const modeMoveBtnLabel = document.getElementById('mode-move-btn-label');
	const modeRemoveBtnLabel = document.getElementById('mode-remove-btn-label');

	const decalIndicator = document.getElementById('decal-mode-indicator');
	const hintBadge = document.getElementById('hint-badge');

	// Logo & Text Adjustments UI Containers
	const decalAdjustments = document.getElementById('decal-adjustments');
	const decalCountBadge = document.getElementById('decal-count-badge');
	const textAdvancedOptions = document.getElementById('text-advanced-options');
	const textCountBadge = document.getElementById('text-count-badge');

	// Live Badge Elements
	const logoScaleValBadge = document.getElementById('logo-scale-val-badge');
	const logoRotValBadge = document.getElementById('logo-rot-val-badge');
	const textScaleValBadge = document.getElementById('text-scale-val-badge');
	const textRotValBadge = document.getElementById('text-rot-val-badge');

	function formatScaleBadge(scaleVal: number): string {
		const pct = Math.round(scaleVal * 100);
		const cm = Math.round(scaleVal * 80);
		return `${pct}% (~${cm} cm)`;
	}

	// ----------------------------------------------------
	// 🎨 High-Res Canvas Text Generator (1024x1024, Fonts & Letter Spacing)
	// ----------------------------------------------------
	function generateTextCanvasTexture(
		text: string, 
		color: string, 
		curvature: number, 
		fontFamily: string = 'Plus Jakarta Sans',
		letterSpacing: number = 0
	): THREE.CanvasTexture {
		const textCanvas = document.createElement('canvas');
		textCanvas.width = 1024;
		textCanvas.height = 1024;
		const ctx = textCanvas.getContext('2d');

		if (!ctx) return new THREE.CanvasTexture(textCanvas);

		ctx.clearRect(0, 0, 1024, 1024);

		if (!text || text.trim() === '') {
			return new THREE.CanvasTexture(textCanvas);
		}

		// FLIP HORIZONTALLY IN CANVAS SPACE SO DECALGEOMETRY PROJECTS RIGHT-SIDE UP!
		ctx.save();
		ctx.translate(1024, 0);
		ctx.scale(-1, 1);

		const fontSize = 110;
		const cleanFontFamily = fontFamily.includes(',') ? fontFamily : `"${fontFamily}", sans-serif`;
		ctx.font = `900 ${fontSize}px ${cleanFontFamily}`;
		ctx.fillStyle = color;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';

		const centerX = 512;
		const centerY = 512;

		if (3 > Math.abs(curvature)) {
			// Straight Line Text with optional Letter Spacing / Anchado
			if (letterSpacing > 0) {
				const charWidths = Array.from(text).map(c => ctx.measureText(c).width + letterSpacing);
				const totalWidth = charWidths.reduce((a, b) => a + b, 0) - letterSpacing;
				let startX = centerX - (totalWidth / 2);

				Array.from(text).forEach((char, i) => {
					const w = charWidths[i];
					ctx.fillText(char, startX + (w / 2) - (letterSpacing / 2), centerY);
					startX += w;
				});
			} else {
				ctx.fillText(text, centerX, centerY);
			}
		} else {
			// Curved Arc Text (Concave vs Convex) with Letter Spacing
			const absCurv = Math.abs(curvature);
			const radius = 1200 - (absCurv * 8.5);
			const isConcave = curvature > 0;
			const arcCenterY = isConcave ? centerY + radius - 80 : centerY - radius + 80;

			const charAngleStep = 0.07 + (letterSpacing * 0.003) + (fontSize * 0.0003);
			const totalAngle = text.length * charAngleStep;
			let startAngle = isConcave ? -totalAngle / 2 : totalAngle / 2;

			Array.from(text).forEach((char, i) => {
				const angle = startAngle + (isConcave ? (i * charAngleStep) : (-i * charAngleStep));

				ctx.save();
				ctx.translate(centerX, arcCenterY);
				ctx.rotate(angle);
				ctx.translate(0, isConcave ? -radius : radius);
				ctx.fillText(char, 0, 0);
				ctx.restore();
			});
		}

		ctx.restore(); // Restore canvas transformation

		const texture = new THREE.CanvasTexture(textCanvas);
		texture.colorSpace = THREE.SRGBColorSpace;
		texture.needsUpdate = true;
		return texture;
	}

	// Update Contextual Labels on Bottom Toolbar depending on active tab
	function updateToolbarContext() {
		if (activeCategoryTab === 'text') {
			if (modeDecalBtnLabel) modeDecalBtnLabel.textContent = '✍️ Estampar Texto';
			if (modeMoveBtnLabel) modeMoveBtnLabel.textContent = '🖐️ Mover Texto';
			if (modeRemoveBtnLabel) modeRemoveBtnLabel.textContent = '🗑️ Eliminar Texto';
		} else {
			if (modeDecalBtnLabel) modeDecalBtnLabel.textContent = '🎯 Estampar Logo';
			if (modeMoveBtnLabel) modeMoveBtnLabel.textContent = '🖐️ Mover Logo';
			if (modeRemoveBtnLabel) modeRemoveBtnLabel.textContent = '🗑️ Eliminar Logo';
		}
	}

	function setInteractionMode(mode: Mode) {
		currentMode = mode;
		isDraggingDecal = false;

		[modeRotateBtn, modeDecalBtn, modeMoveBtn, modeRemoveBtn].forEach(btn => btn?.classList.remove('active'));

		if (mode === 'rotate') {
			controls.enabled = true;
			canvas.style.cursor = 'grab';
			modeRotateBtn?.classList.add('active');
			if (decalIndicator) decalIndicator.classList.add('hidden');
			if (hintBadge) hintBadge.classList.remove('hidden');
		} else if (mode === 'decal') {
			controls.enabled = false;
			canvas.style.cursor = 'crosshair';
			modeDecalBtn?.classList.add('active');
			if (decalIndicator) {
				decalIndicator.textContent = activeCategoryTab === 'text' 
					? '✍️ Modo Estampar Texto Activo: Toca la camisa para colocar el texto'
					: '🎯 Modo Estampar Logo Activo: Toca la camisa para fijar el logo';
				decalIndicator.classList.remove('hidden');
			}
			if (hintBadge) hintBadge.classList.add('hidden');
		} else if (mode === 'move') {
			controls.enabled = false;
			canvas.style.cursor = 'move';
			modeMoveBtn?.classList.add('active');
			if (decalIndicator) {
				decalIndicator.textContent = activeCategoryTab === 'text'
					? '🖐️ Modo Mover Texto: Haz clic y arrastra para reubicar tu texto (los logos se mantienen fijos)'
					: '🖐️ Modo Mover Logo: Haz clic y arrastra para reubicar tu logo (los textos se mantienen fijos)';
				decalIndicator.classList.remove('hidden');
			}
			if (hintBadge) hintBadge.classList.add('hidden');
		} else if (mode === 'remove') {
			controls.enabled = false;
			canvas.style.cursor = 'pointer';
			modeRemoveBtn?.classList.add('active');
			if (decalIndicator) {
				decalIndicator.textContent = activeCategoryTab === 'text'
					? '🗑️ Modo Eliminar Texto: Toca directamente el texto que desees quitar'
					: '🗑️ Modo Eliminar Logo: Toca directamente el logo que desees quitar';
				decalIndicator.classList.remove('hidden');
			}
			if (hintBadge) hintBadge.classList.add('hidden');
		}
	}

	// Update UI Count & 0.30s Animated Adjustments Panels for Logos vs Progressive Text
	function updateDecalUI() {
		const logoItems = decalItems.filter(d => d.type === 'logo');
		const textItems = decalItems.filter(d => d.type === 'text');

		if (decalCountBadge) decalCountBadge.textContent = `${logoItems.length} logo${logoItems.length !== 1 ? 's' : ''}`;
		if (textCountBadge) textCountBadge.textContent = `${textItems.length} texto${textItems.length !== 1 ? 's' : ''}`;

		// 0.30s Animated slide for logo adjustments
		if (decalAdjustments) {
			if (logoItems.length > 0 && activeCategoryTab === 'decal') {
				decalAdjustments.classList.remove('hidden-animated');
			} else {
				decalAdjustments.classList.add('hidden-animated');
			}
		}

		// 0.30s Animated progressive slide for text advanced options & adjustments
		if (textAdvancedOptions) {
			if ((textItems.length > 0 || selectedDecalItem?.type === 'text') && activeCategoryTab === 'text') {
				textAdvancedOptions.classList.remove('hidden-animated');
			} else {
				textAdvancedOptions.classList.add('hidden-animated');
			}
		}
	}

	// Rebuild Decal Mesh Geometry on scale, rotation or position update
	function updateDecalMeshGeometry(item: DecalItem) {
		const orientation = new THREE.Euler();
		const rotationMatrix = new THREE.Matrix4();
		rotationMatrix.lookAt(item.position, item.position.clone().add(item.normal), new THREE.Vector3(0, 1, 0));
		orientation.setFromRotationMatrix(rotationMatrix);
		orientation.z += THREE.MathUtils.degToRad(item.rotation);

		const sizeVector = new THREE.Vector3(item.scale, item.scale, item.scale);
		
		// Replace geometry
		item.mesh.geometry.dispose();
		item.mesh.geometry = new DecalGeometry(item.targetMesh, item.position, orientation, sizeVector);
	}

	// Delete a specific decal item
	function deleteDecalItem(itemToDelete: DecalItem) {
		scene.remove(itemToDelete.mesh);
		itemToDelete.mesh.geometry.dispose();
		if (Array.isArray(itemToDelete.mesh.material)) {
			itemToDelete.mesh.material.forEach(m => m.dispose());
		} else {
			itemToDelete.mesh.material.dispose();
		}

		const idx = decalItems.findIndex(d => d.id === itemToDelete.id);
		if (idx !== -1) decalItems.splice(idx, 1);

		if (selectedDecalItem?.id === itemToDelete.id) {
			const categoryItems = decalItems.filter(d => d.type === activeCategoryTab);
			selectedDecalItem = categoryItems.length > 0 ? categoryItems[categoryItems.length - 1] : null;
		}

		updateDecalUI();
	}

	function clearAllDecals() {
		[...decalItems].forEach(item => deleteDecalItem(item));
		selectedDecalItem = null;
		activeDecalTexture = null;

		const decalBtns = document.querySelectorAll('.decal-item-btn');
		decalBtns.forEach(b => b.classList.remove('active'));

		setInteractionMode('rotate');
	}

	// Toolbar Mode Button Listeners
	modeRotateBtn?.addEventListener('click', () => setInteractionMode('rotate'));
	modeDecalBtn?.addEventListener('click', () => {
		if (activeCategoryTab === 'text') {
			activeTextTexture = generateTextCanvasTexture(currentTextString, currentTextColor, currentTextCurvature, currentFontFamily, currentTextLetterSpacing);
			setInteractionMode('decal');
		} else {
			if (!activeDecalTexture) {
				const firstDecalBtn = document.querySelector('.decal-item-btn') as HTMLButtonElement | null;
				if (firstDecalBtn) firstDecalBtn.click();
			} else {
				setInteractionMode('decal');
			}
		}
	});
	modeMoveBtn?.addEventListener('click', () => setInteractionMode('move'));
	modeRemoveBtn?.addEventListener('click', () => setInteractionMode('remove'));
	modeShareToolbarBtn?.addEventListener('click', () => triggerSmartMultiAngleShare());

	// Helper function to change color across ALL shirt meshes
	function setShirtColor(colorHex: string, colorName?: string) {
		currentShirtColorHex = colorHex;
		if (colorName) currentShirtColorName = colorName;

		const targetColor = new THREE.Color(colorHex);
		shirtMeshes.forEach((mesh) => {
			if (!mesh.material) return;
			const apply = (mat: THREE.Material) => {
				if ('map' in mat && (mat as THREE.MeshStandardMaterial).map) {
					(mat as THREE.MeshStandardMaterial).map?.dispose();
					(mat as THREE.MeshStandardMaterial).map = null;
				}
				if ('color' in mat) {
					(mat as THREE.MeshStandardMaterial).color.copy(targetColor);
					mat.needsUpdate = true;
				}
			};

			if (Array.isArray(mesh.material)) {
				mesh.material.forEach((mat) => apply(mat));
			} else {
				apply(mesh.material);
			}
		});
	}

	// 5. Load GLTF Model & Clone Materials for All 9 Child Sub-Meshes
	const gltfLoader = new GLTFLoader();
	gltfLoader.load(
		'/models/camisa.glb',
		(gltf) => {
			const model = gltf.scene;

			const box = new THREE.Box3().setFromObject(model);
			const center = box.getCenter(new THREE.Vector3());
			const size = box.getSize(new THREE.Vector3());

			const maxDim = Math.max(size.x, size.y, size.z);
			const scaleFactor = 1.6 / maxDim;
			model.scale.setScalar(scaleFactor);
			model.position.sub(center.multiplyScalar(scaleFactor));

			scene.add(model);

			model.traverse((child) => {
				if ((child as THREE.Mesh).isMesh) {
					const mesh = child as THREE.Mesh;
					if (mesh.material) {
						if (Array.isArray(mesh.material)) {
							mesh.material = mesh.material.map(m => m.clone());
						} else {
							mesh.material = mesh.material.clone();
						}
					}
					shirtMeshes.push(mesh);
				}
			});

			setShirtColor("#F4F1EA", "Blanco Hueso"); // base material
			// Apply color from URL params (client-side, works for static sites)
			if (urlColor && urlColor !== '#F4F1EA') {
				setShirtColor(urlColor, urlColorName || 'Personalizado');
				if (customColorInput) customColorInput.value = urlColor;

				// Sync the active state on preset buttons
				const presetBtns = document.querySelectorAll('.color-preset-btn');
				presetBtns.forEach(b => b.classList.remove('active'));
				let matched = false;
				presetBtns.forEach(b => {
					if (b.getAttribute('data-color')?.toLowerCase() === urlColor.toLowerCase()) {
						b.classList.add('active');
						matched = true;
					}
				});
				// If no preset matches, highlight the custom color picker area
				if (!matched && customColorInput) {
					customColorInput.style.outline = `3px solid var(--accent-primary)`;
					customColorInput.style.borderRadius = '50%';
				}
			}
			setInteractionMode('rotate');

			if (loadingOverlay) {
				loadingOverlay.style.opacity = '0';
				setTimeout(() => loadingOverlay.style.display = 'none', 300);
			}
		},
		(progress) => {
			if (progress.lengthComputable && progressBar && loadingText) {
				const percent = Math.round((progress.loaded / progress.total) * 100);
				progressBar.style.width = `${percent}%`;
				loadingText.textContent = `Cargando Modelo 3D (${percent}%)...`;
			}
		},
		(error) => {
			console.error('Error al cargar modelo 3D:', error);
			if (loadingText) loadingText.textContent = 'Error al cargar el modelo 3D.';
		}
	);

	// 6. Color Picker Event Listeners
	const colorPresetBtns = document.querySelectorAll('.color-preset-btn');
	const customColorInput = document.getElementById('shirt-custom-color') as HTMLInputElement | null;

	colorPresetBtns.forEach(btn => {
		btn.addEventListener('click', () => {
			colorPresetBtns.forEach(b => b.classList.remove('active'));
			btn.classList.add('active');
			const color = btn.getAttribute('data-color');
			const name = btn.getAttribute('data-color-name') || "Personalizado";
			if (color) setShirtColor(color, name);
		});
	});

	if (customColorInput) {
		customColorInput.addEventListener('input', (e) => {
			const color = (e.target as HTMLInputElement).value;
			setShirtColor(color, "Personalizado");
		});
	}

	// 7. Decal Selection & Custom SVG Upload Handler with Validation
	const textureLoader = new THREE.TextureLoader();
	const decalGalleryContainer = document.getElementById('decal-gallery-container');
	const customSvgFileInput = document.getElementById('custom-svg-file-input') as HTMLInputElement | null;
	const btnTriggerSvgUpload = document.getElementById('btn-trigger-svg-upload');
	const svgUploadStatus = document.getElementById('svg-upload-status');

	function attachDecalBtnListener(btn: Element) {
		btn.addEventListener('click', () => {
			const allDecalBtns = document.querySelectorAll('.decal-item-btn');
			allDecalBtns.forEach(b => b.classList.remove('active'));
			btn.classList.add('active');

			const url = btn.getAttribute('data-decal-url');
			const nameSpan = btn.querySelector('span');
			if (nameSpan) activeDecalName = nameSpan.textContent || "Emblema";

			if (!url) return;

			textureLoader.load(url, (texture) => {
				texture.colorSpace = THREE.SRGBColorSpace;
				texture.wrapS = THREE.RepeatWrapping;
				texture.repeat.x = -1; // Un-flip SVG logos so they project right-side up!
				activeDecalTexture = texture;
				setInteractionMode('decal');
			});
		});
	}

	// Attach listeners to default preset decal buttons
	const presetDecalBtns = document.querySelectorAll('.decal-item-btn');
	presetDecalBtns.forEach(btn => attachDecalBtnListener(btn));

	// Trigger file input dialog
	btnTriggerSvgUpload?.addEventListener('click', () => {
		customSvgFileInput?.click();
	});

	// Custom SVG File Upload Validation & Loading
	customSvgFileInput?.addEventListener('change', async (e) => {
		const files = (e.target as HTMLInputElement).files;
		if (!files || files.length === 0) return;

		const file = files[0];

		// 1. Extension & MIME Type Check
		const isSvgExtension = file.name.toLowerCase().endsWith('.svg');
		const isSvgMime = file.type === 'image/svg+xml' || file.type === 'image/svg';

		if (!isSvgExtension && !isSvgMime) {
			alert('⚠️ Archivo no válido. Por favor selecciona únicamente un archivo vectorial en formato .svg');
			if (svgUploadStatus) svgUploadStatus.textContent = '❌ Error: El archivo no tiene extensión .svg';
			customSvgFileInput.value = '';
			return;
		}

		// 2. Deep XML Content Validation (Verify file text actually contains <svg tag)
		try {
			const text = await file.text();
			const cleanText = text.trim().toLowerCase();

			if (cleanText.indexOf('<svg') === -1) {
				alert('⚠️ El contenido del archivo no es un gráfico vectorial SVG válido.');
				if (svgUploadStatus) svgUploadStatus.textContent = '❌ Error: Estructura XML no encontrada';
				customSvgFileInput.value = '';
				return;
			}

			// Create Object URL for SVG blob
			const svgUrl = URL.createObjectURL(file);
			activeDecalName = file.name;

			// Dynamically add new custom SVG button to gallery
			if (decalGalleryContainer) {
				const newBtn = document.createElement('button');
				newBtn.type = 'button';
				newBtn.className = 'decal-item-btn custom-user-svg active';
				newBtn.setAttribute('data-decal-url', svgUrl);

				const imgEl = document.createElement('img');
				imgEl.src = svgUrl;
				imgEl.alt = file.name;

				const spanEl = document.createElement('span');
				spanEl.textContent = file.name.length > 12 ? file.name.substring(0, 10) + '...' : file.name;

				newBtn.appendChild(imgEl);
				newBtn.appendChild(spanEl);

				decalGalleryContainer.appendChild(newBtn);
				attachDecalBtnListener(newBtn);

				// Load texture immediately
				textureLoader.load(svgUrl, (texture) => {
					texture.colorSpace = THREE.SRGBColorSpace;
					texture.wrapS = THREE.RepeatWrapping;
					texture.repeat.x = -1;
					activeDecalTexture = texture;
					setInteractionMode('decal');
				});
			}

			if (svgUploadStatus) {
				svgUploadStatus.textContent = '✅ Logo cargado con éxito';
			}
		} catch (err) {
			console.error('Error al leer archivo SVG:', err);
			alert('⚠️ Ocurrió un error al procesar el archivo SVG.');
			if (svgUploadStatus) svgUploadStatus.textContent = '❌ Error al procesar el archivo.';
		}

		// Reset input so user can re-select same file if desired
		customSvgFileInput.value = '';
	});

	// ----------------------------------------------------
	// ✍️ TEXT CONTROLS LISTENERS (Input, Fonts, Spacing, Curvatura)
	// ----------------------------------------------------
	const customTextInput = document.getElementById('custom-text-input') as HTMLInputElement | null;
	const textColorBtns = document.querySelectorAll('.text-color-btn');
	const textSpacingSlider = document.getElementById('text-spacing-slider') as HTMLInputElement | null;
	const spacingValBadge = document.getElementById('spacing-val-badge');
	const textCurvatureSlider = document.getElementById('text-curvature-slider') as HTMLInputElement | null;
	const curvatureValBadge = document.getElementById('curvature-val-badge');
	const btnActivateTextMode = document.getElementById('btn-activate-text-mode');

	function updateActiveTextDecalTexture() {
		if (selectedDecalItem && selectedDecalItem.type === 'text') {
			selectedDecalItem.textString = currentTextString;
			selectedDecalItem.textColor = currentTextColor;
			selectedDecalItem.textCurvature = currentTextCurvature;
			selectedDecalItem.fontFamily = currentFontFamily;
			selectedDecalItem.letterSpacing = currentTextLetterSpacing;

			selectedDecalItem.texture = generateTextCanvasTexture(
				currentTextString,
				currentTextColor,
				currentTextCurvature,
				currentFontFamily,
				currentTextLetterSpacing
			);
			(selectedDecalItem.mesh.material as THREE.MeshStandardMaterial).map = selectedDecalItem.texture;
			(selectedDecalItem.mesh.material as THREE.MeshStandardMaterial).needsUpdate = true;
		}
	}

	// Listen to custom font selection event from FontPreviewSelector.astro component
	window.addEventListener('font-selected', (e: Event) => {
		const customEvt = e as CustomEvent;
		if (customEvt.detail && (customEvt.detail as any).fontFamily) {
			currentFontFamily = (customEvt.detail as any).fontFamily;
			updateActiveTextDecalTexture();
		}
	});

	if (customTextInput) {
		customTextInput.addEventListener('input', (e) => {
			currentTextString = (e.target as HTMLInputElement).value;
			updateActiveTextDecalTexture();
		});
	}

	textColorBtns.forEach(btn => {
		btn.addEventListener('click', () => {
			textColorBtns.forEach(b => b.classList.remove('active'));
			btn.classList.add('active');
			const color = btn.getAttribute('data-color');
			if (color) {
				currentTextColor = color;
				updateActiveTextDecalTexture();
			}
		});
	});

	if (textSpacingSlider) {
		textSpacingSlider.addEventListener('input', (e) => {
			const val = parseInt((e.target as HTMLInputElement).value, 10);
			currentTextLetterSpacing = val;
			if (spacingValBadge) spacingValBadge.textContent = `${val}px`;
			updateActiveTextDecalTexture();
		});
	}

	if (textCurvatureSlider) {
		textCurvatureSlider.addEventListener('input', (e) => {
			const val = parseInt((e.target as HTMLInputElement).value, 10);
			currentTextCurvature = val;

			if (curvatureValBadge) {
				if (3 > Math.abs(val)) {
					curvatureValBadge.textContent = '0° (Línea Recta)';
				} else if (val > 0) {
					curvatureValBadge.textContent = `+${val}° (Cóncavo ⤺)`;
				} else {
					curvatureValBadge.textContent = `${val}° (Convexo ⤻)`;
				}
			}

			updateActiveTextDecalTexture();
		});
	}

	if (btnActivateTextMode) {
		btnActivateTextMode.addEventListener('click', () => {
			activeTextTexture = generateTextCanvasTexture(currentTextString, currentTextColor, currentTextCurvature, currentFontFamily, currentTextLetterSpacing);
			setInteractionMode('decal');
			if (textAdvancedOptions) textAdvancedOptions.classList.remove('hidden-animated');
		});
	}

	// 8. REAL-TIME CONTINUOUS DRAG POINTER EVENTS
	function updateDecalFromPointer(event: PointerEvent) {
		if (shirtMeshes.length === 0) return;

		const rect = renderer.domElement.getBoundingClientRect();
		mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

		raycaster.setFromCamera(mouse, camera);

		// Filter items scoped to active tab ('logo' vs 'text')
		const scopedDecalItems = decalItems.filter(d => d.type === (activeCategoryTab === 'text' ? 'text' : 'logo'));
		const scopedDecalMeshes = scopedDecalItems.map(d => d.mesh);

		const intersectsDecals = raycaster.intersectObjects(scopedDecalMeshes);
		const intersectsShirt = raycaster.intersectObjects(shirtMeshes);

		// A) REMOVE MODE: Tapping scoped item deletes ONLY that item
		if (currentMode === 'remove' && event.type === 'pointerdown') {
			if (intersectsDecals.length > 0) {
				const hitDecalMesh = intersectsDecals[0].object as THREE.Mesh;
				const itemToDelete = scopedDecalItems.find(d => d.mesh === hitDecalMesh);
				if (itemToDelete) {
					deleteDecalItem(itemToDelete);
				}
			}
			return;
		}

		// B) MOVE MODE: Smooth 1:1 Real-time Dragging (Scoped ONLY to active category!)
		if (currentMode === 'move') {
			// Select item if clicked or pick latest scoped item
			if (!selectedDecalItem || selectedDecalItem.type !== (activeCategoryTab === 'text' ? 'text' : 'logo')) {
				if (intersectsDecals.length > 0) {
					const hitDecalMesh = intersectsDecals[0].object as THREE.Mesh;
					selectedDecalItem = scopedDecalItems.find(d => d.mesh === hitDecalMesh) || scopedDecalItems[scopedDecalItems.length - 1];
				} else if (scopedDecalItems.length > 0) {
					selectedDecalItem = scopedDecalItems[scopedDecalItems.length - 1];
				}
			}

			// Move selected scoped decal in real time on shirt surface
			if (selectedDecalItem && intersectsShirt.length > 0) {
				const intersection = intersectsShirt[0];
				const targetMesh = intersection.object as THREE.Mesh;
				const position = intersection.point;
				const normal = intersection.face ? intersection.face.normal.clone() : new THREE.Vector3(0, 0, 1);
				normal.transformDirection(targetMesh.matrixWorld);

				selectedDecalItem.targetMesh = targetMesh;
				selectedDecalItem.position = position;
				selectedDecalItem.normal = normal;
				updateDecalMeshGeometry(selectedDecalItem);

				if (selectedDecalItem.type === 'text') {
					const textScaleInput = document.getElementById('text-scale-slider') as HTMLInputElement | null;
					const textRotInput = document.getElementById('text-rotation-slider') as HTMLInputElement | null;
					if (textScaleInput) {
						textScaleInput.value = selectedDecalItem.scale.toString();
						if (textScaleValBadge) textScaleValBadge.textContent = formatScaleBadge(selectedDecalItem.scale);
					}
					if (textRotInput) {
						textRotInput.value = selectedDecalItem.rotation.toString();
						if (textRotValBadge) textRotValBadge.textContent = `${selectedDecalItem.rotation}°`;
					}
				} else {
					if (scaleInput) {
						scaleInput.value = selectedDecalItem.scale.toString();
						if (logoScaleValBadge) logoScaleValBadge.textContent = formatScaleBadge(selectedDecalItem.scale);
					}
					if (rotationInput) {
						rotationInput.value = selectedDecalItem.rotation.toString();
						if (logoRotValBadge) logoRotValBadge.textContent = `${selectedDecalItem.rotation}°`;
					}
				}
			}
			return;
		}

		// C) DECAL / TEXT PLACEMENT MODE
		if (currentMode === 'decal' && event.type === 'pointerdown' && intersectsShirt.length > 0) {
			const isTextMode = activeCategoryTab === 'text';
			const textureToUse = isTextMode 
				? (activeTextTexture || generateTextCanvasTexture(currentTextString, currentTextColor, currentTextCurvature, currentFontFamily, currentTextLetterSpacing)) 
				: activeDecalTexture;

			if (!textureToUse) return;

			const intersection = intersectsShirt[0];
			const targetMesh = intersection.object as THREE.Mesh;
			const position = intersection.point;
			const normal = intersection.face ? intersection.face.normal.clone() : new THREE.Vector3(0, 0, 1);
			normal.transformDirection(targetMesh.matrixWorld);

			const scaleToUse = isTextMode ? currentTextScale : currentDecalScale;
			const rotationToUse = isTextMode ? currentTextRotation : currentDecalRotation;

			const orientation = new THREE.Euler();
			const rotationMatrix = new THREE.Matrix4();
			rotationMatrix.lookAt(position, position.clone().add(normal), new THREE.Vector3(0, 1, 0));
			orientation.setFromRotationMatrix(rotationMatrix);
			orientation.z += THREE.MathUtils.degToRad(rotationToUse);

			const sizeVector = new THREE.Vector3(scaleToUse, scaleToUse, scaleToUse);
			const decalGeo = new DecalGeometry(targetMesh, position, orientation, sizeVector);

			const decalMat = new THREE.MeshStandardMaterial({
				map: textureToUse,
				transparent: true,
				depthTest: true,
				depthWrite: false,
				polygonOffset: true,
				polygonOffsetFactor: -4,
				roughness: 0.8
			});

			const decalMesh = new THREE.Mesh(decalGeo, decalMat);
			scene.add(decalMesh);

			const newItem: DecalItem = {
				id: `decal_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
				type: isTextMode ? 'text' : 'logo',
				name: isTextMode ? `Texto "${currentTextString}"` : activeDecalName,
				mesh: decalMesh,
				targetMesh,
				texture: textureToUse,
				position,
				normal,
				scale: scaleToUse,
				rotation: rotationToUse,
				textString: isTextMode ? currentTextString : undefined,
				textColor: isTextMode ? currentTextColor : undefined,
				textCurvature: isTextMode ? currentTextCurvature : undefined,
				fontFamily: isTextMode ? currentFontFamily : undefined,
				letterSpacing: isTextMode ? currentTextLetterSpacing : undefined
			};

			decalItems.push(newItem);
			selectedDecalItem = newItem;
			updateDecalUI();
		}
	}

	renderer.domElement.addEventListener('pointerdown', (e) => {
		if (currentMode === 'rotate') return;
		isDraggingDecal = true;
		updateDecalFromPointer(e);
	});

	renderer.domElement.addEventListener('pointermove', (e) => {
		if (currentMode === 'move' && isDraggingDecal) {
			updateDecalFromPointer(e);
		}
	});

	const stopDragging = () => { isDraggingDecal = false; };
	renderer.domElement.addEventListener('pointerup', stopDragging);
	renderer.domElement.addEventListener('pointerleave', stopDragging);

	// Logo scale & rotation sliders with live badge updates
	const scaleInput = document.getElementById('decal-scale') as HTMLInputElement | null;
	const rotationInput = document.getElementById('decal-rotation') as HTMLInputElement | null;
	const deleteSelectedBtn = document.getElementById('btn-delete-selected');
	const clearAllBtn = document.getElementById('btn-clear-all');

	if (scaleInput) {
		scaleInput.addEventListener('input', (e) => {
			const val = parseFloat((e.target as HTMLInputElement).value);
			currentDecalScale = val;
			if (logoScaleValBadge) logoScaleValBadge.textContent = formatScaleBadge(val);
			if (selectedDecalItem && selectedDecalItem.type === 'logo') {
				selectedDecalItem.scale = val;
				updateDecalMeshGeometry(selectedDecalItem);
			}
		});
	}
	if (rotationInput) {
		rotationInput.addEventListener('input', (e) => {
			const val = parseFloat((e.target as HTMLInputElement).value);
			currentDecalRotation = val;
			if (logoRotValBadge) logoRotValBadge.textContent = `${val}°`;
			if (selectedDecalItem && selectedDecalItem.type === 'logo') {
				selectedDecalItem.rotation = val;
				updateDecalMeshGeometry(selectedDecalItem);
			}
		});
	}

	deleteSelectedBtn?.addEventListener('click', () => {
		if (selectedDecalItem && selectedDecalItem.type === 'logo') {
			deleteDecalItem(selectedDecalItem);
		} else {
			const logoItems = decalItems.filter(d => d.type === 'logo');
			if (logoItems.length > 0) deleteDecalItem(logoItems[logoItems.length - 1]);
		}
	});

	clearAllBtn?.addEventListener('click', () => clearAllDecals());

	// Text Scale & Rotation Sliders & Delete with live badge updates
	const textScaleSlider = document.getElementById('text-scale-slider') as HTMLInputElement | null;
	const textRotationSlider = document.getElementById('text-rotation-slider') as HTMLInputElement | null;
	const btnDeleteSelectedText = document.getElementById('btn-delete-selected-text');

	if (textScaleSlider) {
		textScaleSlider.addEventListener('input', (e) => {
			const val = parseFloat((e.target as HTMLInputElement).value);
			currentTextScale = val;
			if (textScaleValBadge) textScaleValBadge.textContent = formatScaleBadge(val);
			if (selectedDecalItem && selectedDecalItem.type === 'text') {
				selectedDecalItem.scale = val;
				updateDecalMeshGeometry(selectedDecalItem);
			}
		});
	}
	if (textRotationSlider) {
		textRotationSlider.addEventListener('input', (e) => {
			const val = parseFloat((e.target as HTMLInputElement).value);
			currentTextRotation = val;
			if (textRotValBadge) textRotValBadge.textContent = `${val}°`;
			if (selectedDecalItem && selectedDecalItem.type === 'text') {
				selectedDecalItem.rotation = val;
				updateDecalMeshGeometry(selectedDecalItem);
			}
		});
	}

	btnDeleteSelectedText?.addEventListener('click', () => {
		if (selectedDecalItem && selectedDecalItem.type === 'text') {
			deleteDecalItem(selectedDecalItem);
		} else {
			const textItems = decalItems.filter(d => d.type === 'text');
			if (textItems.length > 0) deleteDecalItem(textItems[textItems.length - 1]);
		}
	});

	// 9. Tab Switcher Listener (Color vs Logo vs Text)
	const tabBtns = document.querySelectorAll('.tab-btn');
	const tabContents = document.querySelectorAll('.tab-content');

	tabBtns.forEach(btn => {
		btn.addEventListener('click', () => {
			const target = btn.getAttribute('data-tab') as CategoryTab;
			if (!target) return;

			tabBtns.forEach(b => b.classList.remove('active'));
			tabContents.forEach(c => c.classList.remove('active'));

			btn.classList.add('active');
			const content = document.getElementById(`tab-${target}`);
			if (content) content.classList.add('active');

			activeCategoryTab = target;

			// Update Contextual Toolbar Labels (Logo vs Text)
			updateToolbarContext();
			updateDecalUI();

			if (target === 'color') {
				setInteractionMode('rotate');
			} else if (target === 'text') {
				activeTextTexture = generateTextCanvasTexture(currentTextString, currentTextColor, currentTextCurvature, currentFontFamily, currentTextLetterSpacing);
				const textItems = decalItems.filter(d => d.type === 'text');
				if (textItems.length > 0) {
					selectedDecalItem = textItems[textItems.length - 1];
				}
			} else if (target === 'decal') {
				const logoItems = decalItems.filter(d => d.type === 'logo');
				if (logoItems.length > 0) {
					selectedDecalItem = logoItems[logoItems.length - 1];
				}
			}
		});
	});

	// ----------------------------------------------------
	// 📸 SMART 4-VIEW MULTI-ANGLE CAPTURE & WHATSAPP REPORT
	// ----------------------------------------------------
	async function captureSmartMultiAngleGrid(): Promise<Blob> {
		// Save current camera position & target
		const originalCamPos = camera.position.clone();
		const originalTarget = controls.target.clone();

		// Detect required views based on placed decals
		const viewsToCapture: { name: string; angleY: number }[] = [
			{ name: 'Frente', angleY: 0 }
		];

		const hasBack = decalItems.some(d => -0.15 > d.position.z || -0.2 > d.normal.z);
		const hasLeft = decalItems.some(d => -0.2 > d.position.x);
		const hasRight = decalItems.some(d => d.position.x > 0.2);

		if (hasBack) viewsToCapture.push({ name: 'Espalda', angleY: Math.PI });
		if (hasLeft) viewsToCapture.push({ name: 'Manga / Lado Izquierdo', angleY: -Math.PI / 2 });
		if (hasRight) viewsToCapture.push({ name: 'Manga / Lado Derecho', angleY: Math.PI / 2 });

		const dist = originalCamPos.distanceTo(originalTarget);

		// Take snapshot images
		const capturedImages: { name: string; dataUrl: string }[] = [];

		for (const view of viewsToCapture) {
			const x = dist * Math.sin(view.angleY);
			const z = dist * Math.cos(view.angleY);
			camera.position.set(x, originalCamPos.y, z);
			camera.lookAt(originalTarget);
			controls.target.copy(originalTarget);
			renderer.render(scene, camera);

			capturedImages.push({
				name: view.name,
				dataUrl: renderer.domElement.toDataURL('image/png')
			});
		}

		// Restore original camera & controls
		camera.position.copy(originalCamPos);
		controls.target.copy(originalTarget);
		renderer.render(scene, camera);

		// Stitch captured images into 2D Grid Canvas
		const gridCanvas = document.createElement('canvas');
		const singleWidth = 600;
		const singleHeight = 600;
		const cols = capturedImages.length > 2 ? 2 : capturedImages.length;
		const rows = Math.ceil(capturedImages.length / cols);

		gridCanvas.width = singleWidth * cols;
		gridCanvas.height = singleHeight * rows;
		const ctx = gridCanvas.getContext('2d');

		if (!ctx) throw new Error('No se pudo crear canvas de rejilla');

		ctx.fillStyle = '#F8FAFC';
		ctx.fillRect(0, 0, gridCanvas.width, gridCanvas.height);

		// Load all images asynchronously
		const loadedImgs = await Promise.all(
			capturedImages.map(item => new Promise((resolve) => {
				const img = new Image();
				img.onload = () => resolve({ name: item.name, img });
				img.src = item.dataUrl;
			}))
		);

		loadedImgs.forEach((item, index) => {
			const col = index % cols;
			const row = Math.floor(index / cols);
			const posX = col * singleWidth;
			const posY = row * singleHeight;

			// Draw snapshot
			ctx.drawImage(item.img, posX, posY, singleWidth, singleHeight);

			// Draw Header Badge
			ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
			ctx.fillRect(posX + 16, posY + 16, 220, 36);

			ctx.fillStyle = '#FFFFFF';
			ctx.font = 'bold 16px sans-serif';
			ctx.fillText(`📷 Vista ${item.name}`, posX + 30, posY + 40);

			// Subtle divider line
			ctx.strokeStyle = '#E2E8F0';
			ctx.lineWidth = 2;
			ctx.strokeRect(posX, posY, singleWidth, singleHeight);
		});

		return new Promise((resolve, reject) => {
			gridCanvas.toBlob((blob) => {
				if (blob) resolve(blob);
				else reject(new Error('Falló conversión a Blob'));
			}, 'image/png');
		});
	}

	function generateTechnicalSummaryMessage(): string {
		const logoItems = decalItems.filter(d => d.type === 'logo');
		const textItems = decalItems.filter(d => d.type === 'text');

		let msg = '👕 *DISEÑO DE CAMISA PERSONALIZADA - SEMIREYS*\n\n';
		msg += '🎨 *Color de Tejido:* ' + currentShirtColorName + ' (' + currentShirtColorHex + ')\n\n';

		if (logoItems.length > 0) {
			msg += '🏷️ *Emblemas y Logos (' + logoItems.length + '):*\n';
			logoItems.forEach((item, idx) => {
				msg += '  ' + (idx + 1) + '. ' + (item.name || 'Logo') + '\n';
				msg += '     - Tamaño: ' + formatScaleBadge(item.scale) + ', Rotación: ' + item.rotation + '°\n';
			});
			msg += '\n';
		}

		if (textItems.length > 0) {
			msg += '✍️ *Textos Personalizados (' + textItems.length + '):*\n';
			textItems.forEach((item, idx) => {
				const curvVal = item.textCurvature || 0;
				const isConcave = curvVal > 0;
				const curvLabel = isConcave ? 'Concavo' : 'Convexo';
				const curvStr = curvVal === 0 ? 'Recto' : item.textCurvature + ' gr ' + curvLabel;
				msg += '  ' + (idx + 1) + '. Texto: "' + (item.textString || 'SEMIREYS') + '"\n';
				msg += '     - Tipografía: ' + (item.fontFamily || 'Plus Jakarta Sans') + ' (Google Fonts)\n';
				msg += '     - Color Texto: ' + (item.textColor || '#1B2A4A') + '\n';
				msg += '     - Espaciado Letras: ' + (item.letterSpacing || 0) + 'px\n';
				msg += '     - Forma Curvatura: ' + curvStr + '\n';
				msg += '     - Tamaño: ' + formatScaleBadge(item.scale) + ', Rotación: ' + item.rotation + '°\n';
			});
			msg += '\n';
		}

		msg += 'Adjunto la foto compuesta con las capturas de las zonas diseñadas.';
		return msg;
	}

	async function triggerSmartMultiAngleShare() {
		if (loadingOverlay && loadingText) {
			loadingText.textContent = '📸 Tomando capturas multángulo...';
			loadingOverlay.style.display = 'flex';
			loadingOverlay.style.opacity = '1';
		}

		try {
			const blob = await captureSmartMultiAngleGrid();

			if (loadingOverlay) {
				loadingOverlay.style.opacity = '0';
				setTimeout(() => loadingOverlay.style.display = 'none', 300);
			}

			const file = new File([blob], 'diseno-camisa-semireys.png', { type: 'image/png' });
			const messageText = generateTechnicalSummaryMessage();

			const shareData = {
				files: [file],
				title: 'Mi diseño personalizado - Semireys',
				text: messageText
			};

			const nav = navigator as any;
			if (nav.canShare && nav.canShare(shareData)) {
				try {
					await nav.share(shareData);
				} catch (err) {
					console.log('Compartir cancelado o no soportado:', err);
				}
			} else {
				const downloadLink = document.createElement('a');
				downloadLink.href = URL.createObjectURL(blob);
				downloadLink.download = 'diseno-camisa-semireys.png';
				downloadLink.click();

				const phone = import.meta.env.PUBLIC_WHATSAPP_PHONE;
				const textMsg = encodeURIComponent(messageText);
				const whatsappUrl = `https://api.whatsapp.com/send?phone=${phone}&text=${textMsg}`;

				setTimeout(() => {
					alert('📸 Se ha descargado la foto compuesta con las vistas de tu diseño ("diseno-camisa-semireys.png"). A continuación se abrirá WhatsApp para que la adjuntes al mensaje.');
					window.open(whatsappUrl, '_blank');
				}, 600);
			}
		} catch (err) {
			console.error('Error al generar captura multángulo:', err);
			if (loadingOverlay) loadingOverlay.style.display = 'none';
			alert('⚠️ Ocurrió un error al capturar las fotos multángulo.');
		}
	}

	// 11. Resize & Render Loop
	window.addEventListener('resize', () => {
		if (!container) return;
		camera.aspect = container.clientWidth / container.clientHeight;
		camera.updateProjectionMatrix();
		renderer.setSize(container.clientWidth, container.clientHeight);
	});

	function animate() {
		requestAnimationFrame(animate);
		controls.update();
		renderer.render(scene, camera);
	}

	animate();

	// Mobile panel toggle
	const mobileToggleBtn = document.getElementById('mobile-panel-toggle');
	const controlsPanel = document.querySelector('.controls-panel');
	if (mobileToggleBtn && controlsPanel) {
		mobileToggleBtn.addEventListener('click', () => {
			const expanded = mobileToggleBtn.getAttribute('aria-expanded') === 'true';
			mobileToggleBtn.setAttribute('aria-expanded', String(!expanded));
			controlsPanel.classList.toggle('panel-collapsed', expanded);
		});
	}

	// Panel footer share button (duplicates toolbar share action)
	const panelShareBtn = document.getElementById('panel-share-btn');
	if (panelShareBtn) {
		panelShareBtn.addEventListener('click', () => {
			triggerSmartMultiAngleShare();
		});
	}
});
