const CHANNEL_SLUG = 'train-of-consciousness-g9snd2s-aia'; // Replace with your actual slug

let allNotes = [];
let activeNotes = [];
let noteIndex = 0;
let animationId;
let draggedNote = null;
let dragOffset = { x: 0, y: 0 };
let isDragging = false;
let dragStartTime = 0;

const SPEED = 0.5; // pixels per frame
const NOTE_HEIGHT = 240; // increased height estimate for better spacing
const SPAWN_INTERVAL = 5000; // slightly faster spawning

async function loadAllNotes() {
    try {
        let allBlocks = [];
        let page = 1;
        let hasMorePages = true;
        
        // Keep fetching pages until we get all blocks
        while (hasMorePages) {
            const response = await fetch(`https://api.are.na/v2/channels/${CHANNEL_SLUG}?per=100&page=${page}`);
            const data = await response.json();
            
            if (data.contents && data.contents.length > 0) {
                allBlocks = allBlocks.concat(data.contents);
                page++;
                console.log(`Loaded page ${page - 1}, total blocks so far: ${allBlocks.length}`);
                
                // If we got less than 100 blocks, we're on the last page
                if (data.contents.length < 100) {
                    hasMorePages = false;
                }
            } else {
                hasMorePages = false;
            }
        }
        
        console.log(`Total blocks loaded: ${allBlocks.length}`);
        
        // Filter for text blocks and shuffle them
        allNotes = allBlocks
            .filter(block => block.class === 'Text' && block.content)
            .sort(() => Math.random() - 0.5);
        
        console.log(`Total unique text notes: ${allNotes.length}`);
        
        document.getElementById('loading').style.display = 'none';
        
        if (allNotes.length > 0) {
            startFloatingStream();
        }
        
    } catch (error) {
        document.getElementById('loading').textContent = 'Error loading notes: ' + error.message;
    }
}

function startFloatingStream() {
    // Start the animation loop
    animate();
    
    // Spawn initial notes already on screen
    spawnInitialNotes();
    
    // Then spawn new notes at intervals from the right edge
    setInterval(spawnNote, SPAWN_INTERVAL);
    
    // Reset density every 2 minutes by clearing some notes
    setInterval(() => {
        // Remove every other note to reduce density
        activeNotes = activeNotes.filter((activeNote, index) => {
            if (index % 2 === 0) {
                activeNote.element.remove();
                return false;
            }
            return true;
        });
    }, 120000); // 2 minutes = 120,000ms
}

function truncateText(text, wordLimit) {
    // Split by lines and remove the first line (date)
    const lines = text.split('\n');
    const contentWithoutDate = lines.slice(1).join('\n').trim();
    
    // If there's no content after removing the date line, show a placeholder
    if (!contentWithoutDate) {
        return '[Note content...]';
    }
    
    const words = contentWithoutDate.split(' ');
    if (words.length <= wordLimit) {
        return contentWithoutDate;
    }
    return words.slice(0, wordLimit).join(' ') + '...';
}

function createNoteElement(note, yPosition, xPosition = window.innerWidth) {
    const noteEl = document.createElement('div');
    noteEl.className = 'note';
    noteEl.style.left = xPosition + 'px';
    noteEl.style.top = yPosition + 'px';
    noteEl.textContent = truncateText(note.content, 25);
    noteEl.style.fontSize = '12px';
    
    // Add drag functionality
    noteEl.addEventListener('mousedown', (e) => {
        if (e.button === 0) { // Left click only
            e.preventDefault();
            draggedNote = noteEl;
            isDragging = false; // Reset dragging state
            dragStartTime = Date.now();
            const rect = noteEl.getBoundingClientRect();
            dragOffset.x = e.clientX - rect.left;
            dragOffset.y = e.clientY - rect.top;
        }
    });
    
    // Click to open (only if not dragging)
    noteEl.addEventListener('click', (e) => {
        e.stopPropagation();
        // Only open modal if we didn't just finish dragging
        if (!isDragging && Date.now() - dragStartTime > 50) {
            showFullNote(note.content);
        }
    });
    
    return noteEl;
}

function showFullNote(content) {
    // Convert the content to HTML with proper formatting
    const formattedContent = formatNoteContent(content);
    document.getElementById('full-note-text').innerHTML = formattedContent;
    document.getElementById('modal').style.display = 'flex';
}

function formatNoteContent(content) {
    // Escape HTML to prevent XSS, but we'll selectively allow some tags
    let formatted = content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    
    // Convert line breaks to <br> tags
    formatted = formatted.replace(/\n/g, '<br>');
    
    // Convert URLs to clickable links
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    formatted = formatted.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
    
    // Convert email addresses to clickable links
    const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
    formatted = formatted.replace(emailRegex, '<a href="mailto:$1">$1</a>');
    
    return formatted;
}

function closeModal() {
    document.getElementById('modal').style.display = 'none';
}

function findAvailableYPosition() {
    const margin = 50; // Increased margin for more spacing
    const maxY = window.innerHeight - NOTE_HEIGHT - margin;
    
    // Create more randomized positioning with wider spread
    for (let attempt = 0; attempt < 30; attempt++) {
        const candidateY = margin + Math.random() * (maxY - margin);
        let overlaps = false;
        
        // Check for overlap with a larger buffer zone
        for (let activeNote of activeNotes) {
            const noteRect = activeNote.element.getBoundingClientRect();
            const verticalDistance = Math.abs(candidateY - noteRect.top);
            const horizontalDistance = Math.abs(window.innerWidth - activeNote.x);
            
            // Only check overlap if notes are close horizontally (within 400px)
            if (horizontalDistance < 500 && verticalDistance < NOTE_HEIGHT + 100) {
                overlaps = true;
                break;
            }
        }
        
        if (!overlaps) {
            return candidateY;
        }
    }
    
    // If we still can't find a spot, use a completely random position
    // This prevents infinite stacking
    return margin + Math.random() * (maxY - margin);
}

function spawnNote() {
    if (allNotes.length === 0) return;
    
    // If we've gone through all notes, reshuffle and start over
    if (noteIndex >= allNotes.length) {
        allNotes.sort(() => Math.random() - 0.5); // Reshuffle
        noteIndex = 0; // Reset index
    }
    
    const note = allNotes[noteIndex];
    noteIndex++;
    
    const yPosition = findAvailableYPosition();
    const noteElement = createNoteElement(note, yPosition);
    
    document.body.appendChild(noteElement);
    activeNotes.push({
        element: noteElement,
        x: window.innerWidth,
        isDragging: false,
        velocity: getRandomVelocity()
    });
}

function spawnInitialNotes() {
    if (allNotes.length === 0) return;
    
    // Shuffle the notes before spawning initial batch
    const shuffledNotes = [...allNotes].sort(() => Math.random() - 0.5);
    const notesToSpawn = Math.min(8, shuffledNotes.length);
    
    for (let i = 0; i < notesToSpawn; i++) {
        const note = shuffledNotes[i]; // Use shuffled array instead of sequential
        
        const yPosition = 50 + Math.random() * (window.innerHeight - 200);
        const xPosition = window.innerWidth * 0.2 + Math.random() * window.innerWidth * 0.6;
        
        const noteElement = createNoteElement(note, yPosition, xPosition);
        
        document.body.appendChild(noteElement);
        activeNotes.push({
            element: noteElement,
            x: xPosition,
            isDragging: false,
            velocity: getRandomVelocity()
        });
    }
}

function getRandomVelocity() {
    // Create different movement directions
    const directions = [
        { x: -1, y: 0 },           // Left (original)
        { x: -0.6, y: -0.4 },      // Left and slightly up
        { x: -0.6, y: 0.4 },       // Left and slightly down
        { x: -0.7, y: -0.3 },      // Left and more up
        { x: -0.7, y: 0.3 },       // Left and more down
    ];
    
    const direction = directions[Math.floor(Math.random() * directions.length)];
    const speed = SPEED * (0.8 + Math.random() * 0.2); // Vary speed ±20%
    
    return {
        x: direction.x * speed,
        y: direction.y * speed
    };
}

function animate() {
    // Move all active notes (except dragged ones)
    activeNotes = activeNotes.filter(activeNote => {
        if (!activeNote.isDragging) {
            // Move according to velocity
            activeNote.x += activeNote.velocity.x;
            const currentY = parseFloat(activeNote.element.style.top);
            const newY = currentY + activeNote.velocity.y;
            
            activeNote.element.style.left = activeNote.x + 'px';
            activeNote.element.style.top = newY + 'px';
            
            // Bounce off top and bottom edges
            if (newY <= 0 || newY >= window.innerHeight - NOTE_HEIGHT) {
                activeNote.velocity.y *= -1; // Reverse Y direction
            }
        }
        
        // Remove notes that have moved off screen
        if (activeNote.x < -300) {
            activeNote.element.remove();
            return false;
        }
        return true;
    });
    
    animationId = requestAnimationFrame(animate);
}

function startFloatingStream() {
    // Start the animation loop
    animate();
    
    // Spawn initial notes already on screen
    spawnInitialNotes();
    
    // Then spawn new notes at intervals from the right edge
    setInterval(spawnNote, SPAWN_INTERVAL);
}

function initializeAudio() {
    const audio = document.getElementById('background-audio');
    const audioBtn = document.getElementById('audio-btn');
    const audioIcon = document.getElementById('audio-icon');
    
    // Try to start audio (muted initially due to browser autoplay policies)
    audio.play().catch(e => {
        console.log('Audio autoplay blocked, waiting for user interaction');
    });
    
    // Toggle mute/unmute when button clicked
    audioBtn.addEventListener('click', () => {
        if (audio.muted) {
            audio.muted = false;
            audio.play();
            audioIcon.src = 'play-icon.png';    // Switch to play icon
        } else {
            audio.muted = true;
            audioIcon.src = 'mute-icon.png';    // Switch to mute icon
        }
    });
}

function initializeInfoModal() {
    const infoBtn = document.getElementById('info-btn');
    const infoModal = document.getElementById('info-modal');
    const infoModalContent = document.getElementById('info-modal-content');
    
    // Open modal when info button clicked
    infoBtn.addEventListener('click', () => {
        infoModal.style.display = 'flex';
    });
    
    // Close when clicking outside modal content
    infoModal.addEventListener('click', closeInfoModal);
    // Prevent closing when clicking inside modal
    infoModalContent.addEventListener('click', (e) => {
        e.stopPropagation();
    });
}

function closeInfoModal() {
    document.getElementById('info-modal').style.display = 'none';
}

// Mouse event handlers for dragging
document.addEventListener('mousemove', (e) => {
    if (draggedNote) {
        // Mark as dragging if mouse moved more than 5 pixels
        const timeSinceStart = Date.now() - dragStartTime;
        if (timeSinceStart > 50) { // Small delay to distinguish from click
            isDragging = true;
            draggedNote.style.cursor = 'grabbing';
        }
        
        const newX = e.clientX - dragOffset.x;
        const newY = e.clientY - dragOffset.y;
        
        draggedNote.style.left = newX + 'px';
        draggedNote.style.top = newY + 'px';
        
        // Update the activeNote's position
        const activeNote = activeNotes.find(note => note.element === draggedNote);
        if (activeNote) {
            activeNote.x = newX;
            activeNote.isDragging = isDragging;
        }
    }
});

document.addEventListener('mouseup', () => {
    if (draggedNote) {
        draggedNote.style.cursor = 'pointer';
        
        // Resume movement from current position
        const activeNote = activeNotes.find(note => note.element === draggedNote);
        if (activeNote) {
            activeNote.isDragging = false;
        }
        
        // Keep isDragging true briefly to prevent accidental modal opening
        setTimeout(() => {
            isDragging = false;
        }, 150);
        
        draggedNote = null;
    }
});

// Event listeners
document.getElementById('modal').addEventListener('click', closeModal);
document.getElementById('modal-content').addEventListener('click', (e) => {
    e.stopPropagation();
});

// Handle window resize
window.addEventListener('resize', () => {
    // Update positions of existing notes if needed
});

// Load notes when page loads
window.addEventListener('load', () => {
    loadAllNotes();
    initializeAudio();
    initializeInfoModal();
});