document.addEventListener('DOMContentLoaded', function() {
    const wordInput = document.getElementById('wordInput');
    const generateBtn = document.getElementById('generateBtn');
    const messageDiv = document.getElementById('message');
    
    // Function to get the appropriate letter files based on word length
    function getLetterFiles(wordLength) {
        let size;
        let useSimpleFilename = false;
        
        // Special handling for sizes 11 and 12
        if (wordLength >= 11 && wordLength <= 12) {
            size = '1112';
            useSimpleFilename = true;  // Flag for simple filenames in letters1112 folder
        } else {
            // Clamp word length between 1 and 10
            size = Math.min(Math.max(wordLength, 1), 10);
        }
        
        const letterFiles = {};
        
        // Generate paths for A-Z for the specific size folder
        for (let i = 0; i < 26; i++) {
            const letter = String.fromCharCode(65 + i); // A-Z
            // Use simple filename for letters1112 folder, numbered filename for others
            letterFiles[letter] = useSimpleFilename ? 
                `./letters${size}/${letter}.dst` : 
                `./letters${size}/${letter}${size}.dst`;
        }
        
        return letterFiles;
    }
    
    generateBtn.addEventListener('click', async function() {
        const inputWord = wordInput.value.trim().toUpperCase();
        const validLetters = inputWord.split('').filter(char => /^[A-Z]$/.test(char));
        
        if (validLetters.length === 0) {
            showMessage('Please enter at least one valid letter (A-Z)', 'error');
            return;
        }

        // Update max length to 12
        if (validLetters.length > 12) {
            showMessage('Maximum 12 letters allowed', 'error');
            return;
        }
        
        showMessage('Processing... Please wait', 'success');
        
        try {
            // Get letter files based on word length
            const letterFiles = getLetterFiles(validLetters.length);
            
            // Load all required DST files
            const dstPromises = validLetters.map(letter => 
                fetch(letterFiles[letter])
                    .then(response => {
                        if (!response.ok) throw new Error(`File not found: ${letter}.dst for size ${validLetters.length}`);
                        return response.arrayBuffer();
                    })
            );
            
            const dstBuffers = await Promise.all(dstPromises);
            
            // Process the DST files
            const mergedFile = mergeDstFiles(dstBuffers);
            
            // Create download link
            const blob = new Blob([mergedFile], { type: 'application/octet-stream' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${inputWord}.dst`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            showMessage(`Success! Downloading ${inputWord}.dst`, 'success');
        } catch (error) {
            console.error('Error:', error);
            showMessage(`Error: ${error.message}`, 'error');
        }
    });
    
    function showMessage(text, type) {
        messageDiv.textContent = text;
        messageDiv.className = 'message ' + type;
    }
    
    function mergeDstFiles(dstBuffers) {
        if (dstBuffers.length === 0) {
            throw new Error('No DST files to merge');
        }
        
        // Extract headers and stitches
        const headersAndStitches = dstBuffers.map(buffer => {
            const header = buffer.slice(0, 512);
            const stitches = buffer.slice(512);
            return { header, stitches };
        });
        
        // Process stitches (remove all color changes)
        const processedStitches = headersAndStitches.map(({ stitches }) => {
            const stitchesArray = new Uint8Array(stitches);
            const processedArray = [];
            
            for (let i = 0; i < stitchesArray.length; i += 3) {
                // Skip color change commands (F0)
                if (stitchesArray[i + 2] === 0xF0) {
                    continue;
                }
                // Skip end markers (F3)
                if (stitchesArray[i + 2] === 0xF3) {
                    continue;
                }
                // Keep regular stitch commands
                processedArray.push(stitchesArray[i], stitchesArray[i + 1], stitchesArray[i + 2]);
            }
            
            return new Uint8Array(processedArray);
        });
        
        // Calculate total length for merged stitches
        let mergedStitchesLength = processedStitches.reduce((sum, stitches) => sum + stitches.length, 0);
        // Add space for initial color change (3 bytes) and end marker (3 bytes)
        mergedStitchesLength += 6;
        
        const mergedStitches = new Uint8Array(mergedStitchesLength);
        let offset = 0;
        
        // Add single color change at start
        mergedStitches[offset++] = 0x00;
        mergedStitches[offset++] = 0x00;
        mergedStitches[offset++] = 0xF0;  // Color change command
        
        // Combine all stitches
        processedStitches.forEach(stitches => {
            mergedStitches.set(stitches, offset);
            offset += stitches.length;
        });
        
        // Add end marker
        mergedStitches[offset++] = 0x00;
        mergedStitches[offset++] = 0x00;
        mergedStitches[offset++] = 0xF3;  // End marker
        
        // Combine header from first file with merged stitches
        const firstHeader = new Uint8Array(headersAndStitches[0].header);
        const mergedFile = new Uint8Array(firstHeader.length + mergedStitches.length);
        mergedFile.set(firstHeader);
        mergedFile.set(mergedStitches, firstHeader.length);
        
        return mergedFile;
    }
});
