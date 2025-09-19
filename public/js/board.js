// Board rendering and management functions

function renderBoard() {
    const board = document.getElementById('board');
    board.innerHTML = '';
    
    // Update CSS custom properties for grid
    document.documentElement.style.setProperty('--sprint-count', boardData.sprints.length);
    document.documentElement.style.setProperty('--team-count', boardData.teams.length);
    
    // Create header row
    const cornerCell = document.createElement('div');
    cornerCell.className = 'header-cell corner';
    cornerCell.textContent = 'Teams';
    board.appendChild(cornerCell);
    
    // Sprint headers
    boardData.sprints.forEach(sprint => {
        const sprintHeader = document.createElement('div');
        sprintHeader.className = 'header-cell sprint-header';
        sprintHeader.innerHTML = `${sprint.name}`;
        board.appendChild(sprintHeader);
    });
    
    // Team rows
    boardData.teams.forEach(team => {
        // Team header
        const teamHeader = document.createElement('div');
        teamHeader.className = 'header-cell team-header';
        teamHeader.innerHTML = `${team.name}`;
        board.appendChild(teamHeader);
        
        // Grid cells for each sprint
        boardData.sprints.forEach(sprint => {
            const gridCell = document.createElement('div');
            gridCell.className = 'grid-cell';
            gridCell.dataset.team = team.id;
            gridCell.dataset.sprint = sprint.id;
            
            // Add features to this cell
            const featuresInCell = boardData.features.filter(f => 
                f.team === team.id && f.sprint === sprint.id
            );
            
            featuresInCell.forEach(feature => {
                const card = createFeatureElement(feature);
                gridCell.appendChild(card);
            });
            
            // Add drag event listeners
            gridCell.addEventListener('dragover', handleDragOver);
            gridCell.addEventListener('drop', handleDrop);
            gridCell.addEventListener('dragleave', handleDragLeave);
            
            board.appendChild(gridCell);
        });
    });
    
    // Update form options
    updateFormOptions();
    
    // Redraw dependencies
    setTimeout(drawDependencies, 100);
}

function createFeatureElement(feature) {
    const card = document.createElement('div');
    const teamData = boardData.teams.find(d => d.id === feature.team);
    card.className = `card ${teamData ? teamData.color : 'team-dev'}`;
    card.draggable = true;
    card.dataset.cardId = feature.id;
    card.innerHTML = `
        <div class="status-indicator"></div>
        <div class="dependency-dot start" title="Click to connect"></div>
        <div class="dependency-dot end" title="Click to connect"></div>
        <div class="card-title" onclick="showFeatureInfo(${feature.id})" ondblclick="editFeature(${feature.id})" title="Click to view info, double-click to edit">${feature.title}</div>
        <div class="card-meta">
            <span class="card-id">#${feature.id}</span>
            <span>${feature.assignee || 'Unassigned'}</span>
        </div>
    `;
    
    // Add dependency click handlers
    card.querySelector('.dependency-dot.start').addEventListener('click', (e) => handleDependencyClick(feature.id, e));
    card.querySelector('.dependency-dot.end').addEventListener('click', (e) => handleDependencyClick(feature.id, e));
    
    // Drag events
    card.addEventListener('dragstart', handleDragStart);
    card.addEventListener('dragend', handleDragEnd);
    
    return card;
}

function updateFormOptions() {
    const teamSelect = document.getElementById('featureTeam');
    const sprintSelect = document.getElementById('featureSprint');
    
    // Update team options
    teamSelect.innerHTML = '';
    boardData.teams.forEach(team => {
        const option = document.createElement('option');
        option.value = team.id;
        option.textContent = team.name;
        teamSelect.appendChild(option);
    });
    
    // Update sprint options
    sprintSelect.innerHTML = '';
    boardData.sprints.forEach(sprint => {
        const option = document.createElement('option');
        option.value = sprint.id;
        option.textContent = sprint.name;
        sprintSelect.appendChild(option);
    });
}

// Drag and drop functionality
function handleDragStart(e) {
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('cardId', e.target.dataset.cardId);
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
    setTimeout(drawDependencies, 50);
}

function handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    
    const featureId = parseInt(e.dataTransfer.getData('cardId'));
    const dragging = document.querySelector('.dragging');
    
    if (dragging && e.currentTarget.classList.contains('grid-cell')) {
        const newTeam = e.currentTarget.dataset.team;
        const newSprint = parseInt(e.currentTarget.dataset.sprint);
        
        // Update feature data
        const feature = boardData.features.find(f => f.id === featureId);
        if (feature) {
            feature.team = newTeam;
            feature.sprint = newSprint;
            
            // Emit move event to server
            socket.emit('move-feature', {
                featureId: featureId,
                team: newTeam,
                sprint: newSprint
            });
            
            // Update card class and move it
            const teamData = boardData.teams.find(d => d.id === newTeam);
            dragging.className = `card ${teamData ? teamData.color : 'team-dev'}`;
            e.currentTarget.appendChild(dragging);
        }
    }
}

function handleDragLeave(e) {
    if (e.currentTarget.classList.contains('grid-cell')) {
        e.currentTarget.classList.remove('drag-over');
    }
}

// Dependency management
function toggleDependencyMode() {
    dependencyMode = !dependencyMode;
    selectedCardForDependency = null;
    
    const btn = document.querySelector('.btn-secondary');
    btn.style.background = dependencyMode ? '#dc2626' : '#48bb78';
    btn.textContent = dependencyMode ? '🔗 Exit Dependency Mode' : '🔗 Dependencies';
    
    if (dependencyMode) {
        document.body.classList.add('dependency-mode');
    } else {
        document.body.classList.remove('dependency-mode');
        document.querySelectorAll('.card').forEach(card => {
            card.classList.remove('selected-for-dependency');
        });
    }
}

function handleDependencyClick(featureId, event) {
    event.stopPropagation();
    event.preventDefault();
    
    if (!dependencyMode) return;
    
    const card = document.querySelector(`[data-card-id="${featureId}"]`);
    
    if (!selectedCardForDependency) {
        selectedCardForDependency = featureId;
        card.classList.add('selected-for-dependency');
    } else {
        if (selectedCardForDependency !== featureId) {
            const exists = boardData.dependencies.some(d => 
                (d.from === selectedCardForDependency && d.to === featureId) ||
                (d.from === featureId && d.to === selectedCardForDependency)
            );
            
            if (!exists) {
                // Open dependency modal to get relationship details
                openDependencyModal(selectedCardForDependency, featureId, true);
                // Don't clear selection here - let the modal save function handle it
                return;
            }
        }
        
        // Clear selection if same card clicked or dependency already exists
        document.querySelector(`[data-card-id="${selectedCardForDependency}"]`).classList.remove('selected-for-dependency');
        selectedCardForDependency = null;
    }
}

function drawDependencies() {
    const svg = document.getElementById('dependencySvg');
    svg.innerHTML = '';
    
    // Add defs for arrow marker
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', 'arrowhead');
    marker.setAttribute('markerWidth', '10');
    marker.setAttribute('markerHeight', '10');
    marker.setAttribute('refX', '9');
    marker.setAttribute('refY', '3');
    marker.setAttribute('orient', 'auto');
    
    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.setAttribute('points', '0 0, 10 3, 0 6');
    polygon.setAttribute('fill', '#dc2626');
    
    marker.appendChild(polygon);
    defs.appendChild(marker);
    svg.appendChild(defs);
    
    boardData.dependencies.forEach(dep => {
        const fromCard = document.querySelector(`[data-card-id="${dep.from}"]`);
        const toCard = document.querySelector(`[data-card-id="${dep.to}"]`);
        
        if (fromCard && toCard) {
            const fromRect = fromCard.getBoundingClientRect();
            const toRect = toCard.getBoundingClientRect();
            
            const x1 = fromRect.right;
            const y1 = fromRect.top + fromRect.height / 2;
            const x2 = toRect.left;
            const y2 = toRect.top + toRect.height / 2;
            
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            
            const controlPoint1X = x1 + Math.abs(x2 - x1) * 0.3;
            const controlPoint2X = x2 - Math.abs(x2 - x1) * 0.3;
            
            path.setAttribute('d', `M ${x1} ${y1} C ${controlPoint1X} ${y1}, ${controlPoint2X} ${y2}, ${x2} ${y2}`);
            path.setAttribute('stroke', '#dc2626');
            path.setAttribute('stroke-width', '2');
            path.setAttribute('fill', 'none');
            path.setAttribute('marker-end', 'url(#arrowhead)');
            path.setAttribute('opacity', '0.8');
            path.style.filter = 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))';
            path.style.cursor = 'pointer';
            path.setAttribute('data-dependency', `${dep.from}-${dep.to}`);
            
            // Add tooltip with dependency info
            const fromFeature = boardData.features.find(f => f.id === dep.from);
            const toFeature = boardData.features.find(f => f.id === dep.to);
            const relationship = dep.relationship || 'depends on';
            const additionalInfo = dep.additionalInfo || 'No additional info';
            path.setAttribute('title', `${fromFeature?.title} ${relationship} ${toFeature?.title}\n${additionalInfo}`);
            
            // Add click handler for dependency
            path.addEventListener('click', () => {
                showDependencyInfo(dep);
            });
            
            svg.appendChild(path);
        }
    });
}

function clearDependencies() {
    boardData.dependencies = [];
    socket.emit('update-dependencies', boardData.dependencies);
    drawDependencies();
}

// Feature management
function addNewFeature() {
    currentEditingFeature = null;
    document.getElementById('featureModalTitle').textContent = 'Add New Feature';
    document.getElementById('featureTitle').value = '';
    document.getElementById('featureTeam').value = boardData.teams[0]?.id || '';
    document.getElementById('featureSprint').value = boardData.sprints[0]?.id || '';
    document.getElementById('featureAssignee').value = '';
    document.getElementById('featureDescription').value = '';
    document.getElementById('deleteFeatureBtn').style.display = 'none';
    document.getElementById('featureModal').style.display = 'block';
}

function editFeature(featureId) {
    const feature = boardData.features.find(f => f.id === featureId);
    if (!feature) return;
    
    currentEditingFeature = feature;
    document.getElementById('featureModalTitle').textContent = 'Edit Feature';
    document.getElementById('featureTitle').value = feature.title;
    document.getElementById('featureTeam').value = feature.team;
    document.getElementById('featureSprint').value = feature.sprint;
    document.getElementById('featureAssignee').value = feature.assignee || '';
    document.getElementById('featureDescription').value = feature.description || '';
    document.getElementById('deleteFeatureBtn').style.display = 'block';
    document.getElementById('featureModal').style.display = 'block';
}

function saveFeature() {
    const title = document.getElementById('featureTitle').value.trim();
    const team = document.getElementById('featureTeam').value;
    const sprint = parseInt(document.getElementById('featureSprint').value);
    const assignee = document.getElementById('featureAssignee').value.trim();
    const description = document.getElementById('featureDescription').value.trim();
    
    if (!title) {
        alert('Feature title is required');
        return;
    }
    
    if (currentEditingFeature) {
        // Update existing feature
        const updatedFeature = {
            id: currentEditingFeature.id,
            title,
            team,
            sprint,
            assignee: assignee || 'Unassigned',
            description
        };
        
        // Update local data
        const index = boardData.features.findIndex(f => f.id === currentEditingFeature.id);
        if (index !== -1) {
            boardData.features[index] = updatedFeature;
        }
        
        // Emit update to server
        socket.emit('update-feature', updatedFeature);
    } else {
        // Create new feature
        const newFeature = {
            title,
            team,
            sprint,
            assignee: assignee || 'Unassigned',
            description
        };
        
        // Emit creation to server
        socket.emit('create-feature', newFeature);
    }
    
    closeFeatureModal();
    renderBoard();
}

function deleteFeature() {
    if (!currentEditingFeature) return;
    
    if (confirm('Are you sure you want to delete this feature?')) {
        // Remove from local data
        boardData.features = boardData.features.filter(f => f.id !== currentEditingFeature.id);
        
        // Remove dependencies
        boardData.dependencies = boardData.dependencies.filter(d => 
            d.from !== currentEditingFeature.id && d.to !== currentEditingFeature.id
        );
        
        // Emit updates to server
        socket.emit('update-feature', { id: currentEditingFeature.id, deleted: true });
        socket.emit('update-dependencies', boardData.dependencies);
        
        closeFeatureModal();
        renderBoard();
    }
}

function closeFeatureModal() {
    document.getElementById('featureModal').style.display = 'none';
    currentEditingFeature = null;
}

// Management functions
function showManagement() {
    renderManagementModal();
    document.getElementById('managementModal').style.display = 'block';
}

function renderManagementModal() {
    const teamsList = document.getElementById('teamsList');
    const sprintsList = document.getElementById('sprintsList');
    
    // Render teams
    teamsList.innerHTML = '';
    boardData.teams.forEach(team => {
        const item = document.createElement('div');
        item.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #1a202c; margin: 5px 0; border-radius: 6px;';
        item.innerHTML = `
            <span>${team.name}</span>
            <button class="btn btn-danger" onclick="removeTeam('${team.id}')" style="padding: 4px 8px; font-size: 12px;">Remove</button>
        `;
        teamsList.appendChild(item);
    });
    
    // Render sprints
    sprintsList.innerHTML = '';
    boardData.sprints.forEach(sprint => {
        const item = document.createElement('div');
        item.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #1a202c; margin: 5px 0; border-radius: 6px;';
        item.innerHTML = `
            <span>${sprint.name}</span>
            <button class="btn btn-danger" onclick="removeSprint(${sprint.id})" style="padding: 4px 8px; font-size: 12px;">Remove</button>
        `;
        sprintsList.appendChild(item);
    });
}

function addTeam() {
    const name = prompt('Enter team name:');
    if (name && name.trim()) {
        const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const newTeam = {
            id,
            name: name.trim(),
            color: `team-${id}`
        };
        
        // Only emit to server, don't add locally - server will broadcast back
        socket.emit('add-team', newTeam);
    }
}

function addSprint() {
    const name = prompt('Enter sprint name:');
    if (name && name.trim()) {
        const id = Math.max(...boardData.sprints.map(s => s.id), 0) + 1;
        const newSprint = {
            id,
            name: name.trim()
        };
        
        // Only emit to server, don't add locally - server will broadcast back
        socket.emit('add-sprint', newSprint);
    }
}

function removeTeam(teamId) {
    const team = boardData.teams.find(d => d.id === teamId);
    if (!team) return;
    
    const featuresInTeam = boardData.features.filter(f => f.team === teamId);
    let confirmMessage = `Remove team "${team.name}"?`;
    
    if (featuresInTeam.length > 0) {
        confirmMessage += `\n\nThis will also remove ${featuresInTeam.length} feature(s) in this team.`;
    }
    
    if (confirm(confirmMessage)) {
        // Only emit to server, don't remove locally - server will broadcast back
        socket.emit('remove-team', teamId);
    }
}

function removeSprint(sprintId) {
    const sprint = boardData.sprints.find(s => s.id === sprintId);
    if (!sprint) return;
    
    const featuresInSprint = boardData.features.filter(f => f.sprint === sprintId);
    let confirmMessage = `Remove sprint "${sprint.name}"?`;
    
    if (featuresInSprint.length > 0) {
        confirmMessage += `\n\nThis will also remove ${featuresInSprint.length} feature(s) in this sprint.`;
    }
    
    if (confirm(confirmMessage)) {
        // Only emit to server, don't remove locally - server will broadcast back
        socket.emit('remove-sprint', sprintId);
    }
}

function closeManagementModal() {
    document.getElementById('managementModal').style.display = 'none';
}

// Event listeners for scrolling and resizing
document.querySelector('.board-wrapper').addEventListener('scroll', () => {
    drawDependencies();
});

window.addEventListener('resize', drawDependencies);

// Handle access code input
document.getElementById('accessCode').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        joinSession();
    }
});

// Close modals when clicking outside
window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.style.display = 'none';
    }
});

// Dependency modal functions
function openDependencyModal(fromFeatureId, toFeatureId, isNew, existingDependency = null) {
    const fromFeature = boardData.features.find(f => f.id === fromFeatureId);
    const toFeature = boardData.features.find(f => f.id === toFeatureId);
    
    if (!fromFeature || !toFeature) {
        console.error('Could not find features:', fromFeatureId, toFeatureId);
        return;
    }
    
    currentEditingDependency = existingDependency;
    
    document.getElementById('dependencyModalTitle').textContent = isNew ? 'Create Dependency' : 'Edit Dependency';
    document.getElementById('dependencyFromFeature').value = `#${fromFeature.id} - ${fromFeature.title}`;
    document.getElementById('dependencyToFeature').value = `#${toFeature.id} - ${toFeature.title}`;
    document.getElementById('dependencyRelationship').value = existingDependency?.relationship || 'depends on';
    document.getElementById('dependencyAdditionalInfo').value = existingDependency?.additionalInfo || '';
    document.getElementById('deleteDependencyBtn').style.display = isNew ? 'none' : 'block';
    
    // Store the feature IDs for new dependencies
    if (isNew) {
        document.getElementById('dependencyModal').dataset.fromId = fromFeatureId;
        document.getElementById('dependencyModal').dataset.toId = toFeatureId;
    }
    
    document.getElementById('dependencyModal').style.display = 'block';
}

function saveDependency() {
    const relationship = document.getElementById('dependencyRelationship').value;
    const additionalInfo = document.getElementById('dependencyAdditionalInfo').value.trim();
    
    if (currentEditingDependency) {
        // Update existing dependency
        const depIndex = boardData.dependencies.findIndex(d => 
            d.from === currentEditingDependency.from && d.to === currentEditingDependency.to
        );
        if (depIndex !== -1) {
            boardData.dependencies[depIndex].relationship = relationship;
            boardData.dependencies[depIndex].additionalInfo = additionalInfo;
        }
    } else {
        // Create new dependency - get IDs from modal data attributes
        const modal = document.getElementById('dependencyModal');
        const fromId = parseInt(modal.dataset.fromId);
        const toId = parseInt(modal.dataset.toId);
        
        if (!fromId || !toId) {
            console.error('Missing feature IDs for new dependency');
            return;
        }
        
        const newDependency = {
            from: fromId,
            to: toId,
            relationship,
            additionalInfo
        };
        
        console.log('Creating new dependency:', newDependency);
        boardData.dependencies.push(newDependency);
        
        // Clear selection
        if (selectedCardForDependency) {
            const selectedCard = document.querySelector(`[data-card-id="${selectedCardForDependency}"]`);
            if (selectedCard) {
                selectedCard.classList.remove('selected-for-dependency');
            }
            selectedCardForDependency = null;
        }
    }
    
    socket.emit('update-dependencies', boardData.dependencies);
    drawDependencies();
    closeDependencyModal();
}

function deleteDependency() {
    if (!currentEditingDependency) return;
    
    if (confirm('Are you sure you want to delete this dependency?')) {
        boardData.dependencies = boardData.dependencies.filter(d => 
            !(d.from === currentEditingDependency.from && d.to === currentEditingDependency.to)
        );
        
        socket.emit('update-dependencies', boardData.dependencies);
        drawDependencies();
        closeDependencyModal();
    }
}

function closeDependencyModal() {
    const modal = document.getElementById('dependencyModal');
    modal.style.display = 'none';
    
    // Clear dataset
    delete modal.dataset.fromId;
    delete modal.dataset.toId;
    
    currentEditingDependency = null;
}

// Feature Info Display Functions
function showFeatureInfo(featureId) {
    const feature = boardData.features.find(f => f.id === featureId);
    if (!feature) return;
    
    const team = boardData.teams.find(t => t.id === feature.team);
    const sprint = boardData.sprints.find(s => s.id === feature.sprint);
    
    document.getElementById('infoFeatureId').textContent = `#${feature.id}`;
    document.getElementById('infoFeatureTitle').textContent = feature.title;
    document.getElementById('infoFeatureTeam').textContent = team ? team.name : 'Unknown Team';
    document.getElementById('infoFeatureSprint').textContent = sprint ? sprint.name : 'Unknown Sprint';
    document.getElementById('infoFeatureAssignee').textContent = feature.assignee || 'Unassigned';
    document.getElementById('infoFeatureDescription').textContent = feature.description || 'No description provided';
    
    // Store feature ID for edit button
    document.getElementById('featureInfoModal').dataset.featureId = featureId;
    
    document.getElementById('featureInfoModal').style.display = 'block';
}

function closeFeatureInfoModal() {
    document.getElementById('featureInfoModal').style.display = 'none';
    delete document.getElementById('featureInfoModal').dataset.featureId;
}

function editFeatureFromInfo() {
    const featureId = parseInt(document.getElementById('featureInfoModal').dataset.featureId);
    closeFeatureInfoModal();
    editFeature(featureId);
}

// Dependency Info Display Functions
function showDependencyInfo(dependency) {
    const fromFeature = boardData.features.find(f => f.id === dependency.from);
    const toFeature = boardData.features.find(f => f.id === dependency.to);
    
    if (!fromFeature || !toFeature) return;
    
    document.getElementById('infoFromFeature').textContent = `#${fromFeature.id} - ${fromFeature.title}`;
    document.getElementById('infoToFeature').textContent = `#${toFeature.id} - ${toFeature.title}`;
    document.getElementById('infoRelationship').textContent = dependency.relationship || 'depends on';
    document.getElementById('infoAdditionalInfo').textContent = dependency.additionalInfo || 'No additional information provided';
    
    // Store dependency info for edit button
    const modal = document.getElementById('dependencyInfoModal');
    modal.dataset.fromId = dependency.from;
    modal.dataset.toId = dependency.to;
    modal.dataset.relationship = dependency.relationship || 'depends on';
    modal.dataset.additionalInfo = dependency.additionalInfo || '';
    
    modal.style.display = 'block';
}

function closeDependencyInfoModal() {
    const modal = document.getElementById('dependencyInfoModal');
    modal.style.display = 'none';
    
    // Clear dataset
    delete modal.dataset.fromId;
    delete modal.dataset.toId;
    delete modal.dataset.relationship;
    delete modal.dataset.additionalInfo;
}

function editDependencyFromInfo() {
    const modal = document.getElementById('dependencyInfoModal');
    const fromId = parseInt(modal.dataset.fromId);
    const toId = parseInt(modal.dataset.toId);
    const relationship = modal.dataset.relationship;
    const additionalInfo = modal.dataset.additionalInfo;
    
    const dependency = { from: fromId, to: toId, relationship, additionalInfo };
    
    closeDependencyInfoModal();
    openDependencyModal(fromId, toId, false, dependency);
}