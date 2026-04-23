/* ==========================================================================
   EDITEUR TINYMCE - MAKMUS (VERSION CORRIGÉE - SANS DOUBLONS)
   ========================================================================== */

var editor = null;
var currentArticleId = null;
var currentUser = null;
var mediaCount = 0;

var urlParams = new URLSearchParams(window.location.search);
currentArticleId = urlParams.get('id');

/* --------------------------------------
   FONCTIONS UTILITAIRES
   -------------------------------------- */
function generateSlug(title, id) {
    if (!title) return '';
    
    var withoutAccents = title
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    
    var slug = withoutAccents
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    
    var shortId;
    if (id && id !== 'null' && id !== 'undefined') {
        shortId = id.replace(/-/g, '').substring(0, 8);
    } else {
        shortId = Date.now().toString().substring(0, 8);
    }
    
    return slug + '-' + shortId;
}

function validateSlug(slug) {
    return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug);
}

/* --------------------------------------
   GESTION DES MÉDIAS MULTIPLES
   -------------------------------------- */
function addMediaItem(mediaData) {
    var container = document.getElementById('media-items');
    if (!container) return;
    
    var index = mediaCount++;
    
    var mediaHtml = '<div class="media-group" data-index="' + index + '">' +
        '<div class="media-group-header">' +
            '<span class="media-group-title">Média ' + (index + 1) + '</span>' +
            '<button type="button" class="remove-media-btn" onclick="removeMediaItem(' + index + ')">' +
                '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                    '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>' +
                    '<line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>' +
                '</svg>' +
                'Supprimer' +
            '</button>' +
        '</div>' +
        '<div class="form-group">' +
            '<label>Type</label>' +
            '<select class="media-type-select" data-field="type" data-index="' + index + '">' +
                '<option value="image"' + (mediaData && mediaData.type === 'image' ? ' selected' : '') + '>Image</option>' +
                '<option value="video"' + (mediaData && mediaData.type === 'video' ? ' selected' : '') + '>Vidéo</option>' +
            '</select>' +
        '</div>' +
        '<div class="form-group">' +
            '<label>URL du média</label>' +
            '<input type="text" class="media-url" data-field="url" data-index="' + index + '" value="' + (mediaData ? (mediaData.url || '') : '') + '" placeholder="https://...">' +
        '</div>' +
        '<div class="form-group">' +
            '<label>Légende / Crédit</label>' +
            '<input type="text" class="media-caption" data-field="caption" data-index="' + index + '" value="' + (mediaData ? (mediaData.caption || '') : '') + '" placeholder="Description...">' +
        '</div>' +
    '</div>';
    
    container.insertAdjacentHTML('beforeend', mediaHtml);
}

function removeMediaItem(index) {
    var element = document.querySelector('.media-group[data-index="' + index + '"]');
    if (element) element.remove();
}

function getAllMedias() {
    var medias = [];
    // ✅ Utiliser uniquement le conteneur #media-items
    var mediaGroups = document.querySelectorAll('#media-items .media-group');
    
    for (var i = 0; i < mediaGroups.length; i++) {
        var group = mediaGroups[i];
        var type = group.querySelector('.media-type-select').value;
        var url = group.querySelector('.media-url').value;
        var caption = group.querySelector('.media-caption').value;
        
        if (url && url.trim() !== '') {
            medias.push({
                type: type,
                url: url,
                caption: caption,
                order: i
            });
        }
    }
    
    return medias;
}

function loadMediasFromArticle(medias) {
    if (!medias || medias.length === 0) return;
    
    // ✅ Réinitialiser le compteur pour éviter les conflits
    mediaCount = 0;
    
    for (var i = 0; i < medias.length; i++) {
        if (medias[i].url && medias[i].url.trim() !== '') {
            addMediaItem(medias[i]);
        }
    }
}
/* --------------------------------------
   GESTION DES ARTICLES PROGRAMMÉS
   -------------------------------------- */

// Récupérer la valeur de la date programmée
function getScheduledDate() {
    const dateInput = document.getElementById('scheduled-publish-date');
    if (!dateInput || !dateInput.value) return null;
    
    const scheduledDate = new Date(dateInput.value);
    const now = new Date();
    
    // Vérifier si la date est dans le futur
    if (scheduledDate <= now) {
        showToast('La date programmée doit être dans le futur', 'error');
        return null;
    }
    
    return scheduledDate.toISOString();
}

// Vérifier si un article est programmé
function isScheduled() {
    const scheduledDate = getScheduledDate();
    return scheduledDate !== null;
}

// Modifier la fonction saveArticle existante
async function saveArticle(status) {
    var title = document.getElementById('article-title').value;
    var excerpt = document.getElementById('article-excerpt').value;
    var category = document.getElementById('article-category').value;
    var subcategory = document.getElementById('article-subcategory').value;
    var tags = document.getElementById('article-tags').value;
    var rawContent = editor ? editor.getContent() : '';
    var content = cleanEditorContent(rawContent);
    var medias = getAllMedias();
    var imageUrl = document.getElementById('article-image')?.value || null;
    var imageCaption = document.getElementById('article-image-caption')?.value || null;
    var authorName = document.getElementById('author-name')?.value || null;
    var authorImage = document.getElementById('author-image')?.value || null;
    var isPriority = document.getElementById('article-priority').checked;
    var videoUrl = document.getElementById('article-video')?.value || null;
    
    // ✅ NOUVEAU : Gestion de la date programmée
    var scheduledDate = getScheduledDate();
    var isScheduledMode = scheduledDate !== null;
    
    if (!title) {
        showToast('Veuillez saisir un titre', 'error');
        return;
    }
    
    // ✅ Si l'article est programmé, on le sauvegarde en mode 'scheduled'
    var finalStatus = status;
    var finalIsPublished = status === 'published';
    var finalScheduledStatus = null;
    
    if (isScheduledMode) {
        finalStatus = 'scheduled';
        finalIsPublished = false;
        finalScheduledStatus = 'scheduled';
        showToast(`Article programmé pour le ${new Date(scheduledDate).toLocaleString('fr-FR')}`, 'info');
    }
    
    // Génération du slug (code existant)
    var slug;
    var customSlug = document.getElementById('article-slug')?.value;
    
    if (customSlug && customSlug.trim() !== '') {
        slug = customSlug
            .toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
    } else if (currentArticleId) {
        try {
            var { data: existing } = await supabaseClient
                .from('articles')
                .select('slug')
                .eq('id', currentArticleId)
                .single();
            if (existing && existing.slug) {
                slug = existing.slug;
            } else {
                slug = generateSlug(title, currentArticleId);
            }
        } catch(e) {
            slug = generateSlug(title, currentArticleId);
        }
    } else {
        slug = generateSlug(title, null);
    }
    
    if (!currentArticleId || (customSlug && customSlug !== '')) {
        try {
            var { data: existingSlug } = await supabaseClient
                .from('articles')
                .select('slug')
                .eq('slug', slug)
                .neq('id', currentArticleId || '');
            
            if (existingSlug && existingSlug.length > 0) {
                slug = slug + '-' + Date.now().toString().substring(0, 6);
                showToast('Slug modifié pour éviter les doublons', 'info');
            }
        } catch(e) {}
    }
    
    showToast('Sauvegarde en cours...', 'info');
    
    try {
        var result;
        
        var articleData = {
            titre: title,
            slug: slug,
            description: excerpt || null,
            category: category || null,
            subcategory: subcategory || null,
            tags: tags || null,
            content: content || null,
            medias: medias || [],
            image_url: imageUrl,
            image_caption: imageCaption,
            video_url: videoUrl,
            author_name: authorName || (currentUser?.email?.split('@')[0]) || 'Rédaction',
            author_image: authorImage || null,
            is_priority: isPriority,
            status: finalStatus,
            is_published: finalIsPublished,
            updated_at: new Date(),
            // ✅ NOUVEAUX CHAMPS
            scheduled_publish_at: scheduledDate,
            scheduled_status: finalScheduledStatus
        };
        
        if (currentUser && !currentArticleId) {
            articleData.author_id = currentUser.id;
        }
        
        if (currentArticleId) {
            result = await supabaseClient
                .from('articles')
                .update(articleData)
                .eq('id', currentArticleId);
        } else {
            articleData.created_at = new Date();
            articleData.views = 0;
            result = await supabaseClient
                .from('articles')
                .insert([articleData]);
            
            if (result.data && result.data[0]) {
                currentArticleId = result.data[0].id;
                window.history.pushState({}, '', '?id=' + currentArticleId);
            }
        }
        
        if (result.error) throw result.error;
        
        var successMessage;
        if (isScheduledMode) {
            successMessage = `Article programmé pour le ${new Date(scheduledDate).toLocaleString('fr-FR')}`;
        } else if (finalStatus === 'published') {
            successMessage = 'Article publié avec succès !\nURL: /article/' + slug;
        } else {
            successMessage = 'Brouillon sauvegardé !';
        }
        showToast(successMessage, 'success');
        
        if (finalStatus === 'published' && !isScheduledMode) {
            setTimeout(function() {
                window.location.href = 'dashboard.html';
            }, 1500);
        }
        
    } catch (error) {
        console.error('Erreur:', error);
        showToast('Erreur: ' + error.message, 'error');
    }
}
/* --------------------------------------
   INITIALISATION TINYMCE
   -------------------------------------- */
function initEditor() {
    tinymce.init({
        selector: '#article-content',
        height: 500,
        width: '100%',
        plugins: 'advlist autolink link image lists charmap preview anchor searchreplace wordcount visualblocks code fullscreen media table emoticons help',
        toolbar: 'undo redo | styles | bold italic | alignleft aligncenter alignright | bullist numlist | link image | preview fullscreen',
        menubar: 'file edit view insert format tools table help',
        
        paste_as_text: false,
        paste_auto_cleanup_on_paste: true,
        paste_remove_styles: true,
        paste_remove_styles_if_webkit: true,
        paste_strip_class_attributes: 'all',
        paste_remove_spans: true,
        paste_retain_style_properties: 'none',
        
        content_style: 'body { font-family: "Lora", Georgia, serif !important; font-size: 18px; line-height: 1.6; max-width: 680px; margin: 0 auto; } img { max-width: 100%; height: auto; } table { width: 100%; border-collapse: collapse; margin: 20px 0; } th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; } th { background-color: #f5f5f5; font-weight: 600; }',
        
        cleanup: true,
        cleanup_on_startup: true,
        
        formats: {
            bold: {inline: 'strong'},
            italic: {inline: 'em'},
            underline: {inline: 'u'}
        },
        
        setup: function(ed) {
            editor = ed;
            
            ed.on('paste', function(e) {
                var content = (e.clipboardData || window.clipboardData).getData('text/html');
                if (content) {
                    // Nettoyer le HTML tout en préservant les tableaux
                    content = cleanPreserveTables(content);
                    e.preventDefault();
                    ed.insertContent(content);
                }
            });
            
            ed.on('PastePostProcess', function(e) {
                var node = e.node;
                if (node) {
                    // Supprimer les styles de tous les éléments
                    var elements = node.querySelectorAll('[style]');
                    for (var i = 0; i < elements.length; i++) {
                        elements[i].removeAttribute('style');
                    }
                    
                    // Nettoyer les spans vides
                    var spans = node.querySelectorAll('span');
                    for (var j = 0; j < spans.length; j++) {
                        var span = spans[j];
                        if (span.attributes.length === 0) {
                            span.outerHTML = span.innerHTML;
                        }
                    }
                    
                    // S'assurer que les tableaux gardent leur structure
                    var tables = node.querySelectorAll('table');
                    for (var k = 0; k < tables.length; k++) {
                        var table = tables[k];
                        table.removeAttribute('style');
                        table.removeAttribute('class');
                        table.removeAttribute('border');
                        table.removeAttribute('cellspacing');
                        table.removeAttribute('cellpadding');
                        table.classList.add('clean-table');
                    }
                }
            });
        }
    });
}

// Fonction qui préserve les tableaux mais supprime les styles
function cleanPreserveTables(html) {
    var tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    
    // PRÉSERVER ET NETTOYER LES TABLEAUX
    var tables = tempDiv.querySelectorAll('table');
    for (var i = 0; i < tables.length; i++) {
        var table = tables[i];
        
        // Supprimer tous les attributs de style du tableau
        table.removeAttribute('style');
        table.removeAttribute('class');
        table.removeAttribute('border');
        table.removeAttribute('cellspacing');
        table.removeAttribute('cellpadding');
        table.removeAttribute('bgcolor');
        table.removeAttribute('width');
        table.removeAttribute('height');
        
        // Nettoyer les cellules (th, td)
        var cells = table.querySelectorAll('th, td');
        for (var j = 0; j < cells.length; j++) {
            var cell = cells[j];
            cell.removeAttribute('style');
            cell.removeAttribute('class');
            cell.removeAttribute('bgcolor');
            cell.removeAttribute('width');
            cell.removeAttribute('height');
            // Garder colspan et rowspan si présents
            if (cell.hasAttribute('colspan') && cell.getAttribute('colspan') === '1') {
                cell.removeAttribute('colspan');
            }
            if (cell.hasAttribute('rowspan') && cell.getAttribute('rowspan') === '1') {
                cell.removeAttribute('rowspan');
            }
        }
        
        // Nettoyer les lignes
        var rows = table.querySelectorAll('tr');
        for (var k = 0; k < rows.length; k++) {
            rows[k].removeAttribute('style');
            rows[k].removeAttribute('class');
            rows[k].removeAttribute('bgcolor');
        }
        
        // Nettoyer les sections (thead, tbody, tfoot)
        var sections = table.querySelectorAll('thead, tbody, tfoot');
        for (var l = 0; l < sections.length; l++) {
            sections[l].removeAttribute('style');
            sections[l].removeAttribute('class');
        }
    }
    
    // NETTOYER LE RESTE (supprimer tous les styles)
    var allElements = tempDiv.querySelectorAll('*');
    for (var m = 0; m < allElements.length; m++) {
        var el = allElements[m];
        // Ne pas retraiter les tableaux déjà nettoyés
        if (el.tagName !== 'TABLE' && el.tagName !== 'TR' && el.tagName !== 'TD' && el.tagName !== 'TH' && el.tagName !== 'THEAD' && el.tagName !== 'TBODY' && el.tagName !== 'TFOOT') {
            el.removeAttribute('style');
            el.removeAttribute('class');
        }
        
        // Supprimer les spans vides
        if (el.tagName === 'SPAN' && el.attributes.length === 0) {
            el.outerHTML = el.innerHTML;
        }
    }
    
    // Conversion finale
    var result = tempDiv.innerHTML;
    result = result.replace(/style="[^"]*"/gi, '');
    result = result.replace(/class="[^"]*"/gi, '');
    result = result.replace(/font-family:[^;]+;/gi, '');
    
    return result;
}

// Bouton de collage qui préserve les tableaux
document.getElementById('paste-clean-btn').addEventListener('click', async () => {
    try {
        // Récupérer à la fois le HTML et le texte
        const htmlContent = await navigator.clipboard.readText();
        
        // Détecter si c'est un tableau
        const isTable = htmlContent.includes('<table') || htmlContent.includes('<tr') || htmlContent.includes('</td>') || htmlContent.includes('\t');
        
        if (isTable && htmlContent.includes('<')) {
            // C'est du HTML avec potentiellement un tableau
            let cleanHtml = cleanPreserveTables(htmlContent);
            editor.insertContent(cleanHtml);
            showToast('Tableau collé sans style', 'success');
        } else {
            // C'est du texte brut
            let cleanText = htmlContent.replace(/<[^>]*>/g, '');
            const paragraphs = cleanText.split(/\n\s*\n/);
            const html = paragraphs.map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
            editor.insertContent(html);
            showToast('Texte collé', 'success');
        }
        
    } catch (err) {
        console.error('Erreur:', err);
        showToast('Utilisez Ctrl+Shift+V', 'info');
    }
});
/* --------------------------------------
   CHARGEMENT D'UN ARTICLE
   -------------------------------------- */
async function loadArticle(id) {
    try {
        var { data, error } = await supabaseClient
            .from('articles')
            .select('*')
            .eq('id', id)
            .single();
        
        if (error) throw error;
        
        document.getElementById('article-title').value = data.titre || '';
        document.getElementById('article-excerpt').value = data.description || '';
        document.getElementById('article-category').value = data.category || '';
        document.getElementById('article-subcategory').value = data.subcategory || '';
        document.getElementById('article-tags').value = data.tags || '';
        document.getElementById('author-name').value = data.author_name || '';
        document.getElementById('author-image').value = data.author_image || '';
        document.getElementById('article-image').value = data.image_url || '';
        document.getElementById('article-image-caption').value = data.image_caption || '';
        document.getElementById('article-video').value = data.video_url || '';
        document.getElementById('article-priority').checked = data.is_priority === true;
        
        var slugField = document.getElementById('article-slug');
        if (slugField && data.slug) {
            slugField.value = data.slug;
        }
        
        // ✅ Nettoyer le conteneur avant de charger
        var mediaContainer = document.getElementById('media-items');
        if (mediaContainer) {
            mediaContainer.innerHTML = '';
        }
        mediaCount = 0;
        
        if (data.medias && data.medias.length > 0) {
            loadMediasFromArticle(data.medias);
        }
        
        if (editor && data.content) {
            editor.setContent(data.content);
        }
        
        showStatus('Article chargé', 'success');
    } catch (error) {
        console.error('Erreur chargement:', error);
        showStatus('Erreur de chargement', 'error');
    }
}

function cleanEditorContent(content) {
    content = content.replace(/style="[^"]*"/gi, '');
    content = content.replace(/font-family:[^;]+;/gi, '');
    content = content.replace(/<span[^>]*>/gi, '');
    content = content.replace(/<\/span>/gi, '');
    content = content.replace(/<li style="[^"]*">/gi, '<li>');
    content = content.replace(/<p style="[^"]*">/gi, '<p>');
    content = content.replace(/<p>\s*<\/p>/gi, '');
    content = content.replace(/<p><br[^>]*><\/p>/gi, '');
    
    return content;
}

/* --------------------------------------
   SAUVEGARDE AVEC SLUG
   -------------------------------------- */
async function saveArticle(status) {
    var title = document.getElementById('article-title').value;
    var excerpt = document.getElementById('article-excerpt').value;
    var category = document.getElementById('article-category').value;
    var subcategory = document.getElementById('article-subcategory').value;
    var tags = document.getElementById('article-tags').value;
    var rawContent = editor ? editor.getContent() : '';
    var content = cleanEditorContent(rawContent);
    var medias = getAllMedias();
    var imageUrl = document.getElementById('article-image')?.value || null;
    var imageCaption = document.getElementById('article-image-caption')?.value || null;
    var authorName = document.getElementById('author-name')?.value || null;
    var authorImage = document.getElementById('author-image')?.value || null;
    var isPriority = document.getElementById('article-priority').checked;
    var videoUrl = document.getElementById('article-video')?.value || null;
    
    if (!title) {
        showToast('Veuillez saisir un titre', 'error');
        return;
    }
    
    var slug;
    var customSlug = document.getElementById('article-slug')?.value;
    
    if (customSlug && customSlug.trim() !== '') {
        slug = customSlug
            .toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
    } else if (currentArticleId) {
        try {
            var { data: existing } = await supabaseClient
                .from('articles')
                .select('slug')
                .eq('id', currentArticleId)
                .single();
            if (existing && existing.slug) {
                slug = existing.slug;
            } else {
                slug = generateSlug(title, currentArticleId);
            }
        } catch(e) {
            slug = generateSlug(title, currentArticleId);
        }
    } else {
        slug = generateSlug(title, null);
    }
    
    if (!currentArticleId || (customSlug && customSlug !== '')) {
        try {
            var { data: existingSlug } = await supabaseClient
                .from('articles')
                .select('slug')
                .eq('slug', slug)
                .neq('id', currentArticleId || '');
            
            if (existingSlug && existingSlug.length > 0) {
                slug = slug + '-' + Date.now().toString().substring(0, 6);
                showToast('Slug modifié pour éviter les doublons', 'info');
            }
        } catch(e) {}
    }
    
    showToast('Sauvegarde en cours...', 'info');
    
    try {
        var result;
        
        var articleData = {
            titre: title,
            slug: slug,
            description: excerpt || null,
            category: category || null,
            subcategory: subcategory || null,
            tags: tags || null,
            content: content || null,
            medias: medias || [],
            image_url: imageUrl,
            image_caption: imageCaption,
            video_url: videoUrl,
            author_name: authorName || (currentUser?.email?.split('@')[0]) || 'Rédaction',
            author_image: authorImage || null,
            is_priority: isPriority,
            status: status,
            is_published: status === 'published',
            updated_at: new Date()
        };
        
        if (currentUser && !currentArticleId) {
            articleData.author_id = currentUser.id;
        }
        
        if (currentArticleId) {
            result = await supabaseClient
                .from('articles')
                .update(articleData)
                .eq('id', currentArticleId);
        } else {
            articleData.created_at = new Date();
            articleData.views = 0;
            result = await supabaseClient
                .from('articles')
                .insert([articleData]);
            
            if (result.data && result.data[0]) {
                currentArticleId = result.data[0].id;
                window.history.pushState({}, '', '?id=' + currentArticleId);
            }
        }
        
        if (result.error) throw result.error;
        
        var successMessage = status === 'published' 
            ? 'Article publié avec succès !\nURL: /article/' + slug 
            : 'Brouillon sauvegardé !';
        showToast(successMessage, 'success');
        
        if (status === 'published') {
            setTimeout(function() {
                window.location.href = 'dashboard.html';
            }, 1500);
        }
        
    } catch (error) {
        console.error('Erreur:', error);
        showToast('Erreur: ' + error.message, 'error');
    }
}

function showStatus(message, type) {
    var statusDiv = document.getElementById('status-message');
    statusDiv.textContent = message;
    statusDiv.className = 'status ' + type;
    
    setTimeout(function() {
        statusDiv.className = 'status';
    }, 3000);
}

function previewArticle() {
    var title = document.getElementById('article-title').value;
    var content = editor ? editor.getContent() : '';
    var medias = getAllMedias();
    var authorName = document.getElementById('author-name').value || 'Rédaction';
    
    var mediaHtml = '';
    for (var i = 0; i < medias.length; i++) {
        var m = medias[i];
        if (m.type === 'image') {
            mediaHtml += '<div><img src="' + m.url + '" style="max-width:100%; margin:20px 0;"><p style="color:#666; font-size:12px;">' + (m.caption || '') + '</p></div>';
        } else {
            mediaHtml += '<div><video src="' + m.url + '" controls style="max-width:100%; margin:20px 0;"></video><p style="color:#666; font-size:12px;">' + (m.caption || '') + '</p></div>';
        }
    }
    
    var previewWindow = window.open('', '_blank');
    previewWindow.document.write('<!DOCTYPE html><html><head><title>' + title + ' — Aperçu</title><style>body{max-width:800px;margin:0 auto;padding:40px;font-family:"Lora",serif;font-size:18px;line-height:1.6;}img,video{max-width:100%;height:auto;}.author{color:#666;font-size:14px;margin-bottom:20px;}</style></head><body><h1>' + title + '</h1><div class="author">Par ' + authorName + '</div>' + mediaHtml + content + '</body></html>');
    previewWindow.document.close();
}

function showToast(message, type) {
    type = type || 'success';
    
    var existing = document.querySelector('.editor-toast');
    if (existing) existing.remove();
    
    var toast = document.createElement('div');
    toast.className = 'editor-toast ' + type;
    toast.innerHTML = '<span>' + message + '</span>';
    
    toast.style.cssText = 'position: fixed; bottom: 30px; right: 30px; background: ' + (type === 'error' ? '#dc3545' : '#28a745') + '; color: white; padding: 12px 24px; border-radius: 8px; font-family: "Libre Franklin", sans-serif; font-size: 14px; font-weight: 500; z-index: 10000; box-shadow: 0 4px 12px rgba(0,0,0,0.15); animation: slideIn 0.3s ease;';
    
    document.body.appendChild(toast);
    
    toast.style.transform = 'translateX(0)';
    
    setTimeout(function() {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100px)';
        setTimeout(function() {
            if (toast && toast.remove) toast.remove();
        }, 300);
    }, 3000);
}

var style = document.createElement('style');
style.textContent = '@keyframes slideIn { from { opacity: 0; transform: translateX(100px); } to { opacity: 1; transform: translateX(0); } } .editor-toast { animation: slideIn 0.3s ease; }';
document.head.appendChild(style);

// Ouvrir le studio pour insérer des médias
var openStudioBtn = document.getElementById('open-studio-btn');
if (openStudioBtn) {
    openStudioBtn.addEventListener('click', function() {
        sessionStorage.setItem('editor_return_url', window.location.href);
        window.location.href = 'studio.html?select=true';
    });
}

// Vérifier si on revient du studio avec des médias sélectionnés
var urlParamsStudio = new URLSearchParams(window.location.search);
if (urlParamsStudio.get('insert') === 'true') {
    var urls = sessionStorage.getItem('inserted_media_urls');
    if (urls) {
        var mediaUrls = JSON.parse(urls);
        for (var i = 0; i < mediaUrls.length; i++) {
            addMediaItem({ type: 'image', url: mediaUrls[i], caption: '' });
        }
        sessionStorage.removeItem('inserted_media_urls');
        showToast(mediaUrls.length + ' média(s) ajouté(s)', 'success');
    }
}

/* --------------------------------------
   INITIALISATION
   -------------------------------------- */
document.addEventListener('DOMContentLoaded', function() {
    checkAdminAuth().then(function(authenticated) {
        if (authenticated) {
            currentUser = supabaseClient.auth.user;
            initEditor();
            if (currentArticleId) {
                loadArticle(currentArticleId);
            }
        }
    });
    
    var addBtn = document.getElementById('add-media-btn');
    if (addBtn) {
        addBtn.addEventListener('click', function() {
            addMediaItem(null);
        });
    }
    
    var publishBtn = document.getElementById('publish-btn');
    var draftBtn = document.getElementById('draft-btn');
    var previewBtn = document.getElementById('preview-btn');
    var logoutBtn = document.getElementById('logout-nav');
    
    if (publishBtn) publishBtn.addEventListener('click', function() { saveArticle('published'); });
    if (draftBtn) draftBtn.addEventListener('click', function() { saveArticle('draft'); });
    if (previewBtn) previewBtn.addEventListener('click', previewArticle);
    if (logoutBtn) logoutBtn.addEventListener('click', function() {
        supabaseClient.auth.signOut();
        window.location.href = 'login.html';
    });
});
