const PLATES_KEY = 'BW_MALICIOUS_PLATES'
const DETECTIONS_KEY = 'BW_DETECTIONS'


export function getMaliciousPlates() {
try {
return JSON.parse(localStorage.getItem(PLATES_KEY) || '[]')
} catch (e) { return [] }
}


export function saveMaliciousPlates(plates) {
localStorage.setItem(PLATES_KEY, JSON.stringify(plates))
}


export function addMaliciousPlate(plate) {
const plates = getMaliciousPlates()
if (!plates.includes(plate)) {
plates.unshift(plate)
saveMaliciousPlates(plates)
}
return plates
}


export function removeMaliciousPlate(plate) {
const plates = getMaliciousPlates().filter(p => p !== plate)
saveMaliciousPlates(plates)
return plates
}


export function getDetections() {
try {
return JSON.parse(localStorage.getItem(DETECTIONS_KEY) || '[]')
} catch (e) { return [] }
}


export function addDetection({ plate, severity }) {
const detections = getDetections()
const item = { plate, severity, ts: new Date().toISOString() }
detections.unshift(item)
localStorage.setItem(DETECTIONS_KEY, JSON.stringify(detections))
return item
}