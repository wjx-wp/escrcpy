import logoPath from '$electron/resources/build/logo.svg'

export function adaptiveMessage(content, { type, system } = {}) {
  if (system) {
    new Notification(window.t(`common.${type}`), {
      icon: logoPath,
      body: content,
    })

    return {
      close: () => false,
    }
  }

  return ElMessage[type](content)
}
