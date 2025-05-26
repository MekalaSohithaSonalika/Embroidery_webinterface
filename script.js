document.addEventListener('DOMContentLoaded', function() {
    const wordInput = document.getElementById('wordInput');
    const generateBtn = document.getElementById('generateBtn');
    const messageDiv = document.getElementById('message');
    
    // Map of letters to their DST file paths
    const letterFiles = {
        'A': './letters/A.dst',
        'B': './letters/B.dst',
        'C': './letters/C.dst',
        'D': './letters/D.dst',
        'E': './letters/E.dst',
        'F': './letters/F.dst'
    };
    for (let i = 0; i < 26; i++) {
        const letter = String.fromCharCode(65 + i); // A-Z
        letterFiles[letter] = `./letters/${letter}.dst`;
    }
    
    generateBtn.addEventListener('click', async function() {
        const inputWord = wordInput.value.trim().toUpperCase();
        const validLetters = inputWord.split('').filter(char => /^[A-Z]$/.test(char));
        
        if (validLetters.length === 0) {
            showMessage('Please enter at least one valid letter (A-Z)', 'error');
            return;
        }
        
        showMessage('Processing... Please wait', 'success');
        
        try {
            // Load all required DST files
            const dstPromises = validLetters.map(letter => 
                fetch(letterFiles[letter])
                    .then(response => {
                        if (!response.ok) throw new Error(`File not found: ${letter}.dst`);
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
        
        // Process stitches (remove END markers)
        const processedStitches = headersAndStitches.map(({ stitches }) => {
            const stitchesArray = new Uint8Array(stitches);
            if (stitchesArray.length >= 3 && 
                stitchesArray[stitchesArray.length - 3] === 0x00 &&
                stitchesArray[stitchesArray.length - 2] === 0x00 &&
                stitchesArray[stitchesArray.length - 1] === 0xF3) {
                return stitchesArray.slice(0, -3);
            }
            return stitchesArray;
        });
        
        // Combine all stitches
        let mergedStitchesLength = processedStitches.reduce((sum, stitches) => sum + stitches.length, 0);
        // Add 3 bytes for the final END marker
        mergedStitchesLength += 3;
        
        const mergedStitches = new Uint8Array(mergedStitchesLength);
        let offset = 0;
        
        processedStitches.forEach(stitches => {
            mergedStitches.set(stitches, offset);
            offset += stitches.length;
        });
        
        // Add END marker
        mergedStitches[offset++] = 0x00;
        mergedStitches[offset++] = 0x00;
        mergedStitches[offset++] = 0xF3;
        
        // Combine header from first file with merged stitches
        const firstHeader = new Uint8Array(headersAndStitches[0].header);
        const mergedFile = new Uint8Array(firstHeader.length + mergedStitches.length);
        mergedFile.set(firstHeader);
        mergedFile.set(mergedStitches, firstHeader.length);
        
        return mergedFile;
    }
});
